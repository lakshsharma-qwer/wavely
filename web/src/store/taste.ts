import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArtistRef, Track } from "../lib/types";

// The listener's taste, kept entirely in this browser. Raw listening events are
// turned into a compact profile (artist, genre and song weights with time decay)
// that is sent with recommendation requests. Only anonymous play events go to
// the server, to power "listeners like you" links.

export type TasteEventType = "play" | "complete" | "skip" | "like" | "unlike" | "add";

interface TasteEvent {
  trackId: string;
  artistId: string;
  genre?: string;
  type: TasteEventType;
  ts: number;
}

const WEIGHTS: Record<TasteEventType, number> = { play: 1, complete: 2, add: 3, like: 4, skip: -2, unlike: -3 };
const PICK_WEIGHT = 6;
const HALF_LIFE_DAYS = 21;
const MAX_EVENTS = 1500;
const MAX_TRACKS = 500;
const SERVER_TYPES = new Set(["play", "complete", "skip", "like"]);

export const ADVENTURE_LEVELS = [
  { label: "Familiar", value: 0.15 },
  { label: "Balanced", value: 0.4 },
  { label: "Uncharted", value: 0.75 },
] as const;

export interface Profile {
  artists: { id: string; name: string; w: number }[];
  genres: { name: string; w: number }[];
  seeds: Track[];
  top: Track[];
  heard: string[];
  skippedArtists: string[];
  adventure: number;
}

interface TasteState {
  deviceId: string;
  events: TasteEvent[];
  tracks: Record<string, Track>;
  artistNames: Record<string, string>;
  picks: ArtistRef[];
  adventure: number;
  autoplay: boolean;
  outbox: { trackId: string; artistId: string; type: string; ts: number }[];

  log: (type: TasteEventType, track: Track) => void;
  togglePick: (artist: ArtistRef) => void;
  setAdventure: (value: number) => void;
  setAutoplay: (on: boolean) => void;
  takeOutbox: () => TasteState["outbox"];
}

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Drop the engine's annotation before storing a song.
const strip = ({ reason: _reason, ...t }: Track): Track => t;

export const useTaste = create<TasteState>()(
  persist(
    (set, get) => ({
      deviceId: newId(),
      events: [],
      tracks: {},
      artistNames: {},
      picks: [],
      adventure: 0.4,
      autoplay: true,
      outbox: [],

      log: (type, track) => {
        const ts = Date.now();
        const event = { trackId: track.id, artistId: track.artist.id, genre: track.genre, type, ts };
        const events = [...get().events, event].slice(-MAX_EVENTS);
        let tracks = { ...get().tracks, [track.id]: strip(track) };
        const ids = Object.keys(tracks);
        if (ids.length > MAX_TRACKS) {
          const keep = new Set(events.slice(-MAX_TRACKS).map((e) => e.trackId));
          tracks = Object.fromEntries(Object.entries(tracks).filter(([id]) => keep.has(id)));
        }
        set({
          events,
          tracks,
          artistNames: { ...get().artistNames, [track.artist.id]: track.artist.name },
          outbox: SERVER_TYPES.has(type)
            ? [...get().outbox, { trackId: track.id, artistId: track.artist.id, type, ts }].slice(-200)
            : get().outbox,
        });
      },

      togglePick: (artist) => {
        const picks = get().picks;
        set({
          picks: picks.some((a) => a.id === artist.id) ? picks.filter((a) => a.id !== artist.id) : [...picks, artist],
          artistNames: { ...get().artistNames, [artist.id]: artist.name },
        });
      },

      setAdventure: (adventure) => set({ adventure }),
      setAutoplay: (autoplay) => set({ autoplay }),
      takeOutbox: () => {
        const out = get().outbox;
        set({ outbox: [] });
        return out;
      },
    }),
    { name: "wavely-taste" },
  ),
);

const decay = (ts: number, now: number) => Math.pow(0.5, (now - ts) / (HALF_LIFE_DAYS * 86_400_000));

/** Builds the compact profile the recommendation engine scores against. */
export function buildProfile(state = useTaste.getState()): Profile {
  const now = Date.now();
  const artistW = new Map<string, number>();
  const genreW = new Map<string, number>();
  const trackW = new Map<string, number>();
  const skips = new Map<string, number>();

  for (const e of state.events) {
    const w = WEIGHTS[e.type] * decay(e.ts, now);
    artistW.set(e.artistId, (artistW.get(e.artistId) ?? 0) + w);
    if (e.genre) genreW.set(e.genre, (genreW.get(e.genre) ?? 0) + w);
    trackW.set(e.trackId, (trackW.get(e.trackId) ?? 0) + w);
    if (e.type === "skip") skips.set(e.artistId, (skips.get(e.artistId) ?? 0) + 1);
  }
  for (const p of state.picks) {
    artistW.set(p.id, (artistW.get(p.id) ?? 0) + PICK_WEIGHT);
    if (p.genre) genreW.set(p.genre, (genreW.get(p.genre) ?? 0) + PICK_WEIGHT / 2);
  }

  const positive = (m: Map<string, number>) => [...m].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);

  const seen = new Set<string>();
  const seeds: Track[] = [];
  for (const e of [...state.events].reverse()) {
    if (seeds.length >= 10) break;
    if (!["complete", "like", "add"].includes(e.type) || seen.has(e.trackId)) continue;
    seen.add(e.trackId);
    const t = state.tracks[e.trackId];
    if (t && (trackW.get(t.id) ?? 0) > 0) seeds.push(t);
  }

  return {
    artists: positive(artistW)
      .slice(0, 25)
      .map(([id, w]) => ({ id, name: state.artistNames[id] ?? "", w: Math.round(w * 100) / 100 }))
      .filter((a) => a.name),
    genres: positive(genreW)
      .slice(0, 10)
      .map(([name, w]) => ({ name, w: Math.round(w * 100) / 100 })),
    seeds,
    top: positive(trackW)
      .filter(([, w]) => w >= 2)
      .flatMap(([id]) => (state.tracks[id] ? [state.tracks[id]] : []))
      .slice(0, 25),
    heard: [...new Set(state.events.map((e) => e.trackId).reverse())].slice(0, 600),
    skippedArtists: [...skips]
      .filter(([id, n]) => n >= 3 && (artistW.get(id) ?? 0) < 0)
      .map(([id]) => id)
      .slice(0, 40),
    adventure: state.adventure,
  };
}

/** Sends anonymous listening events so the shared "listeners like you" graph can learn. */
export function startEventSync() {
  const send = (beacon = false) => {
    const { deviceId, takeOutbox } = useTaste.getState();
    const events = takeOutbox().slice(-100);
    if (!events.length) return;
    const body = JSON.stringify({ deviceId, events });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(
        () => {},
      );
    }
  };
  const timer = setInterval(() => send(), 15_000);
  const onHide = () => document.visibilityState === "hidden" && send(true);
  document.addEventListener("visibilitychange", onHide);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onHide);
  };
}
