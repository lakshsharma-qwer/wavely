import { autosave, bump, fromPairs, loadSnapshot, saveSnapshot, toPairs, type EdgePairs } from "./store.js";

// Collaborative signal: songs and artists that the same anonymous listener enjoys
// within one listening session get linked. Over many listeners this becomes
// "people who play this also play that", without accounts or personal data.

export type ListenEvent = {
  trackId: string;
  artistId: string;
  type: "play" | "complete" | "skip" | "like";
  ts: number;
};

const SESSION_GAP_MS = 3 * 60 * 60_000;
const WINDOW = 6;
const POSITIVE_WEIGHT = { play: 0.5, complete: 1, like: 1.5, skip: 0 } as const;
/** Live sessions kept in memory; the oldest are dropped beyond this. */
const MAX_SESSIONS = 50_000;

interface Snapshot {
  tracks: EdgePairs;
  artists: EdgePairs;
}

export class CoPlay {
  tracks = new Map<string, Map<string, number>>();
  artists = new Map<string, Map<string, number>>();
  private sessions = new Map<string, { items: ListenEvent[]; lastTs: number }>();
  private markDirty: () => void;

  constructor() {
    const snap = loadSnapshot<Snapshot>("coplay");
    if (snap) {
      this.tracks = fromPairs(snap.tracks);
      this.artists = fromPairs(snap.artists);
    }
    this.markDirty = autosave(() =>
      saveSnapshot("coplay", { tracks: toPairs(this.tracks), artists: toPairs(this.artists) } satisfies Snapshot),
    );
    // Forget idle sessions so memory stays flat.
    setInterval(() => {
      const cutoff = Date.now() - SESSION_GAP_MS;
      for (const [id, s] of this.sessions) if (s.lastTs < cutoff) this.sessions.delete(id);
    }, 10 * 60_000).unref();
  }

  record(deviceId: string, events: ListenEvent[]) {
    let session = this.sessions.get(deviceId);
    for (const e of events.sort((a, b) => a.ts - b.ts)) {
      const weight = POSITIVE_WEIGHT[e.type];
      if (!session || e.ts - session.lastTs > SESSION_GAP_MS) {
        session = { items: [], lastTs: e.ts };
        this.sessions.set(deviceId, session);
        if (this.sessions.size > MAX_SESSIONS) {
          const oldest = this.sessions.keys().next().value;
          if (oldest !== undefined) this.sessions.delete(oldest);
        }
      }
      session.lastTs = e.ts;
      if (!weight) continue;

      // Link to the few songs enjoyed just before, closer ones counting more.
      session.items.forEach((prev, i) => {
        if (prev.trackId === e.trackId) return;
        const w = weight / (session!.items.length - i);
        bump(this.tracks, e.trackId, prev.trackId, w);
        bump(this.tracks, prev.trackId, e.trackId, w);
        if (prev.artistId !== e.artistId) {
          bump(this.artists, e.artistId, prev.artistId, w);
          bump(this.artists, prev.artistId, e.artistId, w);
        }
      });
      session.items = [...session.items.filter((x) => x.trackId !== e.trackId), e].slice(-WINDOW);
      this.markDirty();
    }
  }
}
