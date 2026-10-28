import { create } from "zustand";
import { persist } from "zustand/middleware";
import { postJson } from "../lib/api";
import type { Track } from "../lib/types";
import { buildProfile, useTaste } from "./taste";

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: Track[];
  /** Unshuffled order, kept while shuffle is on so it can be restored. */
  original: Track[] | null;
  index: number;
  isPlaying: boolean;
  buffering: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  position: number;
  duration: number;
  /** Seek target for the audio engine to apply, then clear. */
  seekTo: number | null;
  error: string | null;
  /** Fetching similar songs to keep playing after the queue ends. */
  radioLoading: boolean;
  /** Queue position where autoplay radio picks begin, or -1. */
  radioFrom: number;

  playTracks: (tracks: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (seconds: number) => void;
  jumpTo: (index: number) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setProgress: (position: number, duration?: number) => void;
  setBuffering: (buffering: boolean) => void;
  setError: (error: string | null) => void;
  startRadio: (seed: Track) => Promise<void>;
  extendWithRadio: (andPlay: boolean) => Promise<void>;
}

async function fetchRadio(seed: Track, exclude: string[]) {
  const profile = buildProfile();
  const { tracks } = await postJson<{ tracks: Track[] }>("/api/recs/radio", {
    seed,
    profile,
    exclude: [...new Set([...exclude, ...profile.heard.slice(0, 150)])].slice(0, 500),
  });
  return tracks;
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function withoutFirst(tracks: Track[], id: string) {
  const i = tracks.findIndex((t) => t.id === id);
  return i < 0 ? tracks : [...tracks.slice(0, i), ...tracks.slice(i + 1)];
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      original: null,
      index: -1,
      isPlaying: false,
      buffering: false,
      shuffle: false,
      repeat: "off",
      volume: 0.8,
      muted: false,
      position: 0,
      duration: 0,
      seekTo: null,
      error: null,
      radioLoading: false,
      radioFrom: -1,

      playTracks: (tracks, startIndex = 0) => {
        if (!tracks.length) return;
        const start = tracks[startIndex] ?? tracks[0];
        const fresh = { isPlaying: true, position: 0, duration: start.duration, error: null, radioFrom: -1 };
        if (get().shuffle) {
          const rest = shuffled(tracks.filter((_, i) => i !== startIndex));
          set({ ...fresh, original: tracks, queue: [start, ...rest], index: 0 });
        } else {
          set({ ...fresh, original: null, queue: tracks, index: Math.max(0, startIndex) });
        }
      },

      togglePlay: () => {
        const { index, queue, isPlaying } = get();
        if (index < 0 || !queue.length) return;
        set({ isPlaying: !isPlaying, error: null });
      },

      setPlaying: (isPlaying) => set({ isPlaying }),

      next: (auto = false) => {
        const { index, queue, repeat } = get();
        if (!queue.length) return;
        if (auto && repeat === "one") {
          set({ seekTo: 0, isPlaying: true });
          return;
        }
        if (index < queue.length - 1) {
          set({ index: index + 1, position: 0, isPlaying: true, error: null });
        } else if (repeat === "off" && useTaste.getState().autoplay) {
          // Keep the music going with songs like the one that just finished.
          void get().extendWithRadio(true);
        } else if (repeat === "all" || !auto) {
          // Manual skip past the end wraps around, as in Spotify.
          set({ index: 0, position: 0, isPlaying: repeat === "all" || get().isPlaying, error: null });
        } else {
          set({ isPlaying: false, seekTo: 0, position: 0 });
        }
      },

      prev: () => {
        const { index, position, repeat, queue } = get();
        if (position > 3 || (index === 0 && repeat !== "all")) {
          set({ seekTo: 0, position: 0 });
        } else {
          set({ index: index === 0 ? queue.length - 1 : index - 1, position: 0, error: null });
        }
      },

      seek: (seconds) => set({ seekTo: seconds, position: seconds }),

      jumpTo: (index) => {
        if (index >= 0 && index < get().queue.length) set({ index, position: 0, isPlaying: true, error: null });
      },

      addToQueue: (track) => {
        const { queue, index, original } = get();
        if (index < 0) return get().playTracks([track]);
        set({ queue: [...queue, track], original: original ? [...original, track] : null });
      },

      playNext: (track) => {
        const { queue, index, original } = get();
        if (index < 0) return get().playTracks([track]);
        const updated = [...queue];
        updated.splice(index + 1, 0, track);
        set({ queue: updated, original: original ? [...original, track] : null });
      },

      removeFromQueue: (i) => {
        const { queue, index, original } = get();
        if (i === index || i < 0 || i >= queue.length) return;
        const removed = queue[i];
        set({
          queue: queue.filter((_, k) => k !== i),
          index: i < index ? index - 1 : index,
          original: original ? withoutFirst(original, removed.id) : null,
        });
      },

      toggleShuffle: () => {
        const { shuffle, queue, index, original } = get();
        const current = queue[index];
        if (!shuffle) {
          if (!current) return set({ shuffle: true });
          const rest = shuffled(queue.filter((_, i) => i !== index));
          set({ shuffle: true, original: queue, queue: [current, ...rest], index: 0 });
        } else {
          const restored = original ?? queue;
          set({
            shuffle: false,
            original: null,
            queue: restored,
            index: current ? Math.max(0, restored.findIndex((t) => t.id === current.id)) : -1,
          });
        }
      },

      cycleRepeat: () => {
        const order: RepeatMode[] = ["off", "all", "one"];
        set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
      },

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: volume === 0 }),
      toggleMute: () => set({ muted: !get().muted }),
      setProgress: (position, duration) => set(duration ? { position, duration } : { position }),
      setBuffering: (buffering) => set({ buffering }),
      setError: (error) => set({ error }),

      startRadio: async (seed) => {
        set({ radioLoading: true });
        try {
          const tracks = await fetchRadio(seed, [seed.id]);
          get().playTracks([seed, ...tracks.filter((t) => t.id !== seed.id)], 0);
          set({ radioFrom: 1 });
        } catch {
          set({ error: "Couldn't start radio. Try again." });
        } finally {
          set({ radioLoading: false });
        }
      },

      extendWithRadio: async (andPlay) => {
        const { queue, index, radioLoading } = get();
        const seed = queue[index];
        if (!seed || radioLoading) return;
        set({ radioLoading: true });
        try {
          const tracks = await fetchRadio(seed, queue.map((t) => t.id));
          if (!tracks.length) throw new Error("empty");
          const current = get();
          set({
            queue: [...current.queue, ...tracks],
            original: current.original ? [...current.original, ...tracks] : null,
            radioFrom: current.radioFrom >= 0 ? current.radioFrom : current.queue.length,
          });
          if (andPlay) set({ index: current.queue.length, position: 0, isPlaying: true, error: null });
        } catch {
          if (andPlay) set({ isPlaying: false, seekTo: 0, position: 0 });
        } finally {
          set({ radioLoading: false });
        }
      },
    }),
    {
      name: "wavely-player",
      // Restore the queue paused, so a reload never blasts audio unexpectedly.
      partialize: (s) => ({
        queue: s.queue,
        original: s.original,
        index: s.index,
        shuffle: s.shuffle,
        repeat: s.repeat,
        volume: s.volume,
        muted: s.muted,
        radioFrom: s.radioFrom,
      }),
    },
  ),
);

export const useCurrentTrack = () => usePlayer((s) => s.queue[s.index] ?? null);
