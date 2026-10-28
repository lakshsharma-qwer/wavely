import type { Track } from "../types.js";
import { autosave, bump, fromPairs, loadSnapshot, saveSnapshot, toPairs, type EdgePairs } from "./store.js";

// The knowledge graph. Every search result passing through the server is folded in,
// so it grows with usage: songs, artists, genres, and links between artists from
// featured credits, shared songwriters and co-appearance in each other's results.

export interface ArtistNode {
  id: string;
  name: string;
  image?: string;
  genres: Record<string, number>;
  trackIds: string[];
  expandedAt?: number;
  /** When the deeper lookup (more pages plus collaborators) last ran. */
  deepAt?: number;
}

interface Snapshot {
  tracks: Track[];
  popularity: [string, number][];
  artists: ArtistNode[];
  related: EdgePairs;
  pending: [string, string[]][];
  composers: [string, string[]][];
}

const MAX_TRACKS = 60_000;
const MAX_TRACKS_PER_ARTIST = 150;

const FEAT_RE = /[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]|\s(?:feat\.?|ft\.?|featuring)\s+(.+)$/i;
const SPLIT_RE = /\s*(?:,|&|\band\b|\bx\b|\+)\s*/i;

const norm = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export class Catalog {
  tracks = new Map<string, Track>();
  /** 0..1, best rank a track has had in any result list (proxy for popularity). */
  popularity = new Map<string, number>();
  artists = new Map<string, ArtistNode>();
  related = new Map<string, Map<string, number>>();
  private byName = new Map<string, string>();
  /** Featured names seen before the artist itself, linked once they appear. */
  private pending = new Map<string, Set<string>>();
  private composers = new Map<string, Set<string>>();
  private markDirty: () => void;

  constructor() {
    const snap = loadSnapshot<Snapshot>("catalog");
    if (snap) {
      for (const t of snap.tracks) this.tracks.set(t.id, t);
      this.popularity = new Map(snap.popularity);
      for (const a of snap.artists) {
        this.artists.set(a.id, a);
        this.byName.set(norm(a.name), a.id);
      }
      this.related = fromPairs(snap.related);
      this.pending = new Map(snap.pending.map(([k, v]) => [k, new Set(v)]));
      this.composers = new Map(snap.composers.map(([k, v]) => [k, new Set(v)]));
      console.log(`[recs] catalog loaded: ${this.tracks.size} songs, ${this.artists.size} artists`);
    }
    this.markDirty = autosave(() => saveSnapshot("catalog", this.snapshot()));
  }

  private snapshot(): Snapshot {
    return {
      tracks: [...this.tracks.values()],
      popularity: [...this.popularity],
      artists: [...this.artists.values()],
      related: toPairs(this.related),
      pending: [...this.pending].map(([k, v]) => [k, [...v]]),
      composers: [...this.composers].map(([k, v]) => [k, [...v]]),
    };
  }

  artistIdByName(name: string) {
    return this.byName.get(norm(name));
  }

  link(a: string, b: string, w: number) {
    bump(this.related, a, b, w);
    bump(this.related, b, a, w);
  }

  /** Folds one page of results in. `query` and `offset` give rank context. */
  ingest(items: Track[], query?: string, offset = 0) {
    if (!items.length) return;
    const queryArtist = query ? this.artistIdByName(query) : undefined;

    items.forEach((t, i) => {
      // Links are drawn once per song, so re-seeing it in later searches can't inflate them.
      const isNew = !this.tracks.has(t.id);
      if (isNew && this.tracks.size >= MAX_TRACKS) {
        const oldest = this.tracks.keys().next().value;
        if (oldest) this.tracks.delete(oldest);
      }
      this.tracks.set(t.id, t);
      const rank = Math.max(0, 1 - (offset + i) / 40);
      this.popularity.set(t.id, Math.max(this.popularity.get(t.id) ?? 0, rank));

      const node = this.upsertArtist(t);
      if (t.genre) node.genres[t.genre] = (node.genres[t.genre] ?? 0) + 1;
      if (!node.trackIds.includes(t.id)) {
        node.trackIds.push(t.id);
        if (node.trackIds.length > MAX_TRACKS_PER_ARTIST) node.trackIds.shift();
      }

      if (!isNew) return;

      for (const name of featuredNames(t.title)) {
        const other = this.artistIdByName(name);
        if (other) this.link(node.id, other, 3);
        else {
          const key = norm(name);
          if (!this.pending.has(key)) this.pending.set(key, new Set());
          this.pending.get(key)!.add(node.id);
        }
      }

      if (t.composer) {
        const key = norm(t.composer);
        if (key && key !== norm(t.artist.name)) {
          const set = this.composers.get(key) ?? new Set<string>();
          if (!set.has(node.id) && set.size < 40) {
            for (const other of set) this.link(node.id, other, 1.5);
            set.add(node.id);
          }
          this.composers.set(key, set);
        }
      }

      // Artists that surface when someone searches for an artist are usually close to them.
      if (queryArtist && queryArtist !== node.id) this.link(queryArtist, node.id, 0.5);
    });
    this.markDirty();
  }

  private upsertArtist(t: Track): ArtistNode {
    let node = this.artists.get(t.artist.id);
    if (!node) {
      node = { id: t.artist.id, name: t.artist.name, image: t.album.cover, genres: {}, trackIds: [] };
      this.artists.set(node.id, node);
      const key = norm(node.name);
      this.byName.set(key, node.id);
      const waiting = this.pending.get(key);
      if (waiting) {
        for (const other of waiting) this.link(node.id, other, 3);
        this.pending.delete(key);
      }
    }
    return node;
  }

  markExpanded(artistId: string, deep = false) {
    const node = this.artists.get(artistId);
    if (node) {
      node.expandedAt = Date.now();
      if (deep) node.deepAt = node.expandedAt;
      this.markDirty();
    }
  }

  /** Names featured on this artist's songs that haven't been seen as artists yet. */
  pendingNamesFor(artistId: string): string[] {
    const names: string[] = [];
    for (const [name, ids] of this.pending) if (ids.has(artistId)) names.push(name);
    return names;
  }

  private genreCache: { at: number; index: Map<string, { id: string; pop: number }[]> } | null = null;

  /** Artists grouped by their main genre, most popular first (rebuilt at most once a minute). */
  genreIndex() {
    if (this.genreCache && Date.now() - this.genreCache.at < 60_000) return this.genreCache.index;
    const index = new Map<string, { id: string; pop: number }[]>();
    for (const node of this.artists.values()) {
      const genre = this.topGenre(node.id);
      if (!genre) continue;
      const pops = node.trackIds.map((id) => this.popularity.get(id) ?? 0).sort((a, b) => b - a).slice(0, 5);
      const pop = pops.reduce((a, b) => a + b, 0) / 5;
      if (!index.has(genre)) index.set(genre, []);
      index.get(genre)!.push({ id: node.id, pop });
    }
    for (const list of index.values()) list.sort((a, b) => b.pop - a.pop);
    this.genreCache = { at: Date.now(), index };
    return index;
  }

  tracksOf(artistId: string): Track[] {
    return (this.artists.get(artistId)?.trackIds ?? []).flatMap((id) => {
      const t = this.tracks.get(id);
      return t && t.artist.id === artistId ? [t] : [];
    });
  }

  topGenre(artistId: string) {
    const genres = this.artists.get(artistId)?.genres ?? {};
    return Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
}

export function featuredNames(title: string): string[] {
  const m = title.match(FEAT_RE);
  const list = m?.[1] ?? m?.[2];
  if (!list) return [];
  return list
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);
}
