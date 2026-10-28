import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Playlist, Track } from "../lib/types";
import { useTaste } from "./taste";

const MAX_RECENT = 30;

interface LibraryState {
  liked: Track[];
  playlists: Playlist[];
  recent: Track[];

  toggleLike: (track: Track) => boolean;
  addRecent: (track: Track) => void;
  createPlaylist: (name?: string, tracks?: Track[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, track: Track) => boolean;
  removeFromPlaylist: (id: string, trackId: string) => void;
}

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      liked: [],
      playlists: [],
      recent: [],

      toggleLike: (track) => {
        const isLiked = get().liked.some((t) => t.id === track.id);
        const { reason: _reason, ...clean } = track;
        set({ liked: isLiked ? get().liked.filter((t) => t.id !== track.id) : [clean, ...get().liked] });
        useTaste.getState().log(isLiked ? "unlike" : "like", track);
        return !isLiked;
      },

      addRecent: ({ reason: _reason, ...track }) =>
        set({ recent: [track, ...get().recent.filter((t) => t.id !== track.id)].slice(0, MAX_RECENT) }),

      createPlaylist: (name, tracks = []) => {
        const id = newId();
        const playlist = { id, name: name ?? `My Playlist #${get().playlists.length + 1}`, tracks, createdAt: Date.now() };
        set({ playlists: [...get().playlists, playlist] });
        return id;
      },

      renamePlaylist: (id, name) =>
        set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) }),

      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),

      addToPlaylist: (id, track) => {
        const playlist = get().playlists.find((p) => p.id === id);
        if (!playlist || playlist.tracks.some((t) => t.id === track.id)) return false;
        useTaste.getState().log("add", track);
        set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, track] } : p)) });
        return true;
      },

      removeFromPlaylist: (id, trackId) =>
        set({
          playlists: get().playlists.map((p) =>
            p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p,
          ),
        }),
    }),
    { name: "wavely-library" },
  ),
);

export const useIsLiked = (id: string | undefined) => useLibrary((s) => !!id && s.liked.some((t) => t.id === id));
