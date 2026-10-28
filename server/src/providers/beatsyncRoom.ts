import { randomInt, randomUUID } from "node:crypto";
import { TtlCache } from "../cache.js";
import type { MusicProvider, SearchPage, Track } from "../types.js";
import { parseSearchPage } from "./beatsync.js";

// Talks to beatsync.gg the same way its web app does: joins a room over the
// public WebSocket, sends SEARCH_MUSIC for results, and sends STREAM_MUSIC so
// Beatsync loads the song into the room and broadcasts its uploads.beatsync.gg URL.

const HOUR = 60 * 60_000;
const SEARCH_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 10_000;
/** Songs being loaded at once; beyond this, new requests are turned away. */
const MAX_PENDING_UPLOADS = 25;

// Embedded in the requested file name so each uploaded URL can be matched to its track.
const marker = (trackId: string) => `[wv-${trackId}]`;
const MARKER_RE = /\[wv-(\d+)\]/;

type Waiter = { resolve: (url: string) => void; reject: (err: Error) => void };

/** One WebSocket client in the shared room. Search replies are unicast and carry no
 *  request id, so each connection runs its searches one at a time. */
class RoomConnection {
  private ws: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private searchChain: Promise<unknown> = Promise.resolve();
  private pendingSearch: { resolve: (v: unknown) => void; reject: (e: Error) => void } | null = null;

  constructor(
    private url: string,
    private onAudioSources: (urls: string[]) => void,
    private onDisconnect: () => void,
  ) {}

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect(): Promise<WebSocket> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    if (this.opening) return this.opening;

    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Timed out connecting to Beatsync"));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to Beatsync"));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws === ws) this.ws = null;
        this.pendingSearch?.reject(new Error("Beatsync connection closed"));
        this.pendingSearch = null;
        this.onDisconnect();
      };
      ws.onmessage = (event) => this.handle(ws, String(event.data));
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private handle(ws: WebSocket, data: string) {
    let msg: { type?: string; response?: unknown; event?: { type?: string; sources?: { url: string }[] } };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === "LIVENESS_PING") {
      ws.send(JSON.stringify({ type: "LIVENESS_PONG" }));
    } else if (msg.type === "SEARCH_RESPONSE") {
      this.pendingSearch?.resolve(msg.response);
    } else if (msg.type === "ROOM_EVENT" && msg.event?.type === "SET_AUDIO_SOURCES") {
      this.onAudioSources((msg.event.sources ?? []).map((s) => s.url));
    }
  }

  search(query: string, offset: number): Promise<unknown> {
    const run = this.searchChain.then(async () => {
      const ws = await this.connect();
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => done(new Error("Beatsync search timed out")), SEARCH_TIMEOUT_MS);
        const done = (err: Error | null, value?: unknown) => {
          clearTimeout(timer);
          this.pendingSearch = null;
          if (err) reject(err);
          else resolve(value);
        };
        this.pendingSearch = { resolve: (v) => done(null, v), reject: (e) => done(e) };
        ws.send(JSON.stringify({ type: "SEARCH_MUSIC", query, offset }));
      });
    });
    this.searchChain = run.catch(() => {});
    return run;
  }

  async send(message: object) {
    const ws = await this.connect();
    ws.send(JSON.stringify(message));
  }
}

export class BeatsyncRoomProvider implements MusicProvider {
  readonly name = "beatsync";
  private connections: RoomConnection[];
  private next = 0;
  private waiters = new Map<string, Waiter[]>();
  /** Track metadata from recent searches, used to name stream requests. */
  private tracks = new TtlCache<Track>(6 * HOUR, 20_000);
  /** Uploaded files stay available while the room lives; stale ones are invalidated by the proxy. */
  private urls = new TtlCache<string>(6 * HOUR, 20_000);

  private roomId: string;

  constructor(
    wsUrl: string,
    poolSize: number,
    private allowedHosts: string[],
  ) {
    // Every connection joins the same room, so any of them receives the upload broadcasts.
    // A long random id keeps the room unguessable; anyone inside it could add sources.
    const roomId = `${randomInt(1e9, 1e10 - 1)}${randomInt(1e5, 1e6 - 1)}`;
    this.roomId = roomId;
    const connUrl = (clientId: string) => {
      const url = new URL(wsUrl);
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("username", "wavely");
      url.searchParams.set("clientId", clientId);
      return url.toString();
    };
    this.connections = Array.from(
      { length: Math.max(1, poolSize) },
      () =>
        new RoomConnection(
          connUrl(randomUUID()),
          (urls) => this.resolveUploads(urls),
          () => this.failWaitersIfOffline(),
        ),
    );
    console.log(`Beatsync connected via ${wsUrl} (${this.connections.length} connections)`);
  }

  private pick() {
    const conn = this.connections[this.next % this.connections.length];
    this.next++;
    return conn;
  }

  /** Only Beatsync's own upload storage, for files in our room, is trusted. */
  private isTrustedUpload(raw: string) {
    try {
      const url = new URL(raw);
      return (
        url.protocol === "https:" &&
        this.allowedHosts.includes(url.hostname.toLowerCase()) &&
        url.pathname.startsWith(`/room-${this.roomId}/`)
      );
    } catch {
      return false;
    }
  }

  private resolveUploads(urls: string[]) {
    for (const url of urls) {
      if (!this.isTrustedUpload(url)) continue;
      let decoded: string;
      try {
        decoded = decodeURIComponent(url);
      } catch {
        continue;
      }
      const id = decoded.match(MARKER_RE)?.[1];
      if (!id) continue;
      const waiting = this.waiters.get(id);
      if (!waiting) continue;
      this.waiters.delete(id);
      for (const w of waiting) w.resolve(url);
    }
  }

  private failWaitersIfOffline() {
    // Uploads broadcast to every connection, so only give up when the whole pool is gone.
    setTimeout(() => {
      if (this.connections.some((c) => c.isOpen)) return;
      for (const [id, waiting] of this.waiters) {
        this.waiters.delete(id);
        for (const w of waiting) w.reject(new Error("Lost connection to Beatsync"));
      }
    }, 1000);
  }

  async search(query: string, offset: number): Promise<SearchPage> {
    const response = (await this.pick().search(query, offset)) as
      | { type: "success"; response: unknown }
      | { type: "error"; message: string };
    if (response?.type !== "success") {
      throw new Error(`Beatsync search failed: ${response?.type === "error" ? response.message : "bad response"}`);
    }
    const page = parseSearchPage(response.response);
    for (const t of page.items) this.tracks.set(t.id, t);
    return page;
  }

  getStreamUrl(trackId: string): Promise<string> {
    return this.urls.wrap(trackId, () => this.requestUpload(trackId));
  }

  invalidateStream(trackId: string) {
    this.urls.delete(trackId);
  }

  private requestUpload(trackId: string): Promise<string> {
    if (this.waiters.size >= MAX_PENDING_UPLOADS) {
      return Promise.reject(new Error("Too many songs loading at once"));
    }
    const track = this.tracks.get(trackId);
    const name = track ? `${track.artist.name} - ${track.title}` : `track-${trackId}`;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(trackId)?.filter((w) => w !== waiter);
        if (list?.length) this.waiters.set(trackId, list);
        else this.waiters.delete(trackId);
        reject(new Error(`Beatsync took too long to load track ${trackId}`));
      }, STREAM_TIMEOUT_MS);

      const waiter: Waiter = {
        resolve: (url) => {
          clearTimeout(timer);
          resolve(url);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.waiters.set(trackId, [...(this.waiters.get(trackId) ?? []), waiter]);

      this.pick()
        .send({ type: "STREAM_MUSIC", trackId: Number(trackId), trackName: `${name} ${marker(trackId)}` })
        .catch((err: Error) => waiter.reject(err));
    });
  }
}
