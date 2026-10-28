import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Router, type NextFunction, type Request, type Response } from "express";
import { TtlCache } from "./cache.js";
import { config } from "./config.js";
import type { Music } from "./music.js";
import type { RecEngine } from "./recs/engine.js";
import type { CoPlay } from "./recs/coplay.js";
import { createRecsRouter } from "./recs/routes.js";
import { isAllowedStreamUrl, rateLimit } from "./security.js";

const MINUTE = 60_000;

function dedupeBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const PASSTHROUGH_HEADERS = ["content-length", "content-range", "accept-ranges", "etag", "last-modified"];
const AUDIO_TYPE = /^audio\/[\w.+-]+$/i;
const TRACK_ID = /^\d{1,20}$/;

export function createApi(music: Music, engine: RecEngine, coplay: CoPlay, streamHosts: string[]) {
  const { provider, search, searchDeep, catalog } = music;
  const router = Router();
  const homeCache = new TtlCache<unknown>(30 * MINUTE, 1);
  // Signed stream URLs typically expire, so keep them only briefly.
  const streamUrlCache = new TtlCache<string>(5 * MINUTE, 2000);

  router.get("/health", (_req, res) => {
    res.json({ ok: true, provider: provider.name });
  });

  // Streaming is exempt: a single song issues several Range requests while seeking.
  const limiter = rateLimit(config.rateLimitPerMinute);
  router.use((req, res, next) => (req.method === "GET" && /^\/tracks\/\d+\/stream$/.test(req.path) ? next() : limiter(req, res, next)));

  router.use(createRecsRouter(engine, coplay, catalog));

  // Loading a song nobody has played recently makes Beatsync fetch it, so new
  // loads are limited per visitor; cached songs and seeking stay unlimited.
  const resolveLimit = rateLimit(config.streamResolvesPerMinute);

  /** Resolves a song's audio URL, but only for songs the catalog knows. */
  const resolveStream = (req: Request, id: string, fresh = false) => {
    if (!catalog.tracks.has(id)) return { error: 404 as const };
    if (fresh) {
      streamUrlCache.delete(id);
      provider.invalidateStream?.(id);
    }
    const cached = streamUrlCache.get(id);
    if (!cached && resolveLimit.check(req)) return { error: 429 as const };
    return { url: cached ? Promise.resolve(cached) : streamUrlCache.wrap(id, () => provider.getStreamUrl(id)) };
  };

  router.get("/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 200);
    const offset = Math.min(Math.max(Number(req.query.offset) || 0, 0), 1000);
    if (!q) return res.status(400).json({ error: "Missing search query" });
    res.json(await search(q, offset));
  });

  router.get("/home", async (_req, res) => {
    const sections = await homeCache.wrap("home", async () => {
      const results = await Promise.allSettled(
        config.homeSections.map(async (s) => ({ ...s, tracks: (await search(s.query)).items.slice(0, 12) })),
      );
      return results.flatMap((r) => (r.status === "fulfilled" && r.value.tracks.length ? [r.value] : []));
    });
    res.json({ sections });
  });

  router.get("/album/:id", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "Missing album search hint (q)" });
    const tracks = dedupeBy(
      (await searchDeep(q)).filter((t) => t.album.id === req.params.id),
      (t) => t.id,
    ).sort((a, b) => a.trackNumber - b.trackNumber);
    if (!tracks.length) return res.status(404).json({ error: "Album not found" });
    res.json({ album: tracks[0].album, artist: tracks[0].artist, tracks });
  });

  router.get("/artist/:id", async (req, res) => {
    const name = String(req.query.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Missing artist name" });
    const tracks = dedupeBy(
      (await searchDeep(name)).filter((t) => t.artist.id === req.params.id),
      (t) => t.id,
    );
    if (!tracks.length) return res.status(404).json({ error: "Artist not found" });
    const albums = dedupeBy(tracks.map((t) => t.album), (a) => a.id).sort((a, b) =>
      (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""),
    );
    res.json({ artist: { ...tracks[0].artist, image: tracks[0].album.cover }, tracks, albums });
  });

  // Warms up the next song in the queue so playback starts without a wait.
  router.post("/tracks/:id/prepare", async (req, res) => {
    const id = req.params.id;
    if (!TRACK_ID.test(id)) return res.status(400).json({ error: "Invalid track id" });
    const r = resolveStream(req, id);
    if (r.error) return res.status(r.error).end();
    await r.url;
    res.status(204).end();
  });

  router.get("/tracks/:id/stream", async (req, res) => {
    const id = req.params.id;
    if (!TRACK_ID.test(id)) return res.status(400).json({ error: "Invalid track id" });
    const range = req.headers.range;
    if (range && !/^bytes=\d*-\d*$/.test(range)) return res.status(416).end();

    const controller = new AbortController();
    res.on("close", () => controller.abort());

    const fetchAudio = async (fresh: boolean) => {
      const r = resolveStream(req, id, fresh);
      if (r.error) return r.error;
      const url = await r.url;
      // Never follow a URL off the allowlist, and never follow redirects to elsewhere.
      if (!isAllowedStreamUrl(url, streamHosts)) {
        streamUrlCache.delete(id);
        provider.invalidateStream?.(id);
        console.warn(`[api] refused stream URL outside STREAM_HOSTS for track ${id}`);
        return 502;
      }
      return fetch(url, {
        headers: range ? { Range: range } : undefined,
        signal: controller.signal,
        redirect: "error",
      });
    };

    let upstream = await fetchAudio(false);
    // A cached signed URL may have expired; resolve a new one once.
    if (typeof upstream !== "number" && [401, 403, 404, 410].includes(upstream.status)) {
      await upstream.body?.cancel();
      upstream = await fetchAudio(true);
    }
    if (typeof upstream === "number") {
      const messages = { 404: "Unknown song. Search for it first.", 429: "Too many new songs at once. Wait a minute and try again." };
      return res.status(upstream).json({ error: messages[upstream as 404 | 429] ?? "Could not load audio for this song" });
    }
    const type = upstream.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!upstream.ok || !upstream.body || !AUDIO_TYPE.test(type)) {
      await upstream.body?.cancel();
      return res.status(502).json({ error: "Could not load audio for this song" });
    }

    res.status(upstream.status);
    // Only ever serve audio from this origin, whatever the upstream claims.
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", "inline");
    for (const name of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.headers.get("accept-ranges")) res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");

    Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>)
      .on("error", () => res.destroy())
      .pipe(res);
  });

  router.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return res.destroy();
    if (err instanceof Error && err.name === "AbortError") return res.end();
    // Malformed or oversized request bodies are the client's fault, not the music service's.
    const status = (err as { status?: number })?.status;
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: status === 413 ? "Request too large" : "Invalid request" });
    }
    if (err instanceof Error && err.message.startsWith("Too many songs loading")) {
      return res.status(503).json({ error: "Lots of people are loading songs right now. Try again shortly." });
    }
    console.error("[api]", err);
    res.status(502).json({ error: "The music service is unavailable right now. Please try again." });
  });

  return router;
}
