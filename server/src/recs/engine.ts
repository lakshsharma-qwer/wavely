import { z } from "zod";
import { TtlCache } from "../cache.js";
import type { Music } from "../music.js";
import type { Track } from "../types.js";
import type { Catalog } from "./catalog.js";
import type { CoPlay } from "./coplay.js";

// Recommendation engine.
//
// Candidates come from the knowledge graph (artists, featured credits, shared
// songwriters, search co-appearance) and the co-listening graph. Each candidate is
// scored against the listener's taste profile, blending "familiar" and "discover"
// terms by their chosen adventure level, then diversified so no artist dominates.
// Every pick carries a plain-language reason.

const DAY = 24 * 60 * 60_000;

const TrackSchema = z.object({
  id: z.string().max(40),
  title: z.string().max(300),
  artist: z.object({ id: z.string().max(40), name: z.string().max(200) }),
  album: z.object({
    id: z.string().max(80),
    title: z.string().max(300),
    cover: z.string().max(500).regex(/^https:\/\//),
    coverSmall: z.string().max(500).regex(/^https:\/\//),
    releaseDate: z.string().max(20).optional(),
  }),
  duration: z.number(),
  explicit: z.boolean(),
  trackNumber: z.number(),
  genre: z.string().max(80).optional(),
  composer: z.string().max(200).optional(),
});

export const ProfileSchema = z.object({
  artists: z.array(z.object({ id: z.string().max(40), name: z.string().max(200), w: z.number() })).max(30).default([]),
  genres: z.array(z.object({ name: z.string().max(80), w: z.number() })).max(20).default([]),
  /** Recent songs the listener enjoyed, newest first. */
  seeds: z.array(TrackSchema).max(12).default([]),
  /** Songs on repeat, strongest first. */
  top: z.array(TrackSchema).max(30).default([]),
  heard: z.array(z.string().max(40)).max(800).default([]),
  skippedArtists: z.array(z.string().max(40)).max(50).default([]),
  adventure: z.number().min(0).max(1).default(0.35),
});
export type Profile = z.infer<typeof ProfileSchema>;
export { TrackSchema };

export type Rec = Track & { reason: string };

export interface Station {
  id: string;
  freq: number;
  kind: "rotation" | "mix" | "genre" | "deep" | "fresh" | "uncharted" | "starter";
  name: string;
  reason: string;
  tracks: Rec[];
}

export interface ArtistRef {
  id: string;
  name: string;
  image?: string;
  genre?: string;
  reason?: string;
}

export interface HomeRecs {
  personalized: boolean;
  stations: Station[];
  rows: { title: string; reason: string; tracks: Rec[] }[];
  artists: { title: string; items: ArtistRef[] } | null;
  /** Artists to pick from when the listener has no history yet. */
  starters: ArtistRef[];
}

export interface SeedGroup {
  name: string;
  artists: string[];
}

interface Ctx {
  artistAff: Map<string, number>;
  relAff: Map<string, { w: number; via: string }>;
  genreAff: Map<string, number>;
  coplay: Map<string, number>;
  heard: Set<string>;
  skipped: Set<string>;
  adventure: number;
}

type Scored = { t: Track; s: number; reason: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits for tasks, but never longer than `ms`; whatever finished is used. */
const within = (ms: number, tasks: Promise<unknown>[]) => Promise.race([Promise.allSettled(tasks), sleep(ms)]);

function normalizeMap(m: Map<string, number>) {
  const max = Math.max(0, ...m.values());
  if (max > 0) for (const [k, v] of m) m.set(k, v / max);
  return m;
}

function recency(date?: string) {
  if (!date) return 0;
  const age = (Date.now() - Date.parse(date)) / DAY;
  if (!Number.isFinite(age) || age < 0) return 0;
  if (age < 60) return 1;
  return Math.max(0, 1 - (age - 60) / 670);
}

const baseTitle = (t: Track) =>
  t.title.toLowerCase().replace(/[([].*?[)\]]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Greedy pick with a per-artist cap, de-duplicated versions, and no back-to-back artists. */
function diversify(items: Scored[], n: number, perArtist: number): Rec[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const picked: Scored[] = [];
  for (const it of [...items].sort((a, b) => b.s - a.s)) {
    const key = `${it.t.artist.id}:${baseTitle(it.t)}`;
    if (seen.has(it.t.id) || seen.has(key)) continue;
    const c = counts.get(it.t.artist.id) ?? 0;
    if (c >= perArtist) continue;
    counts.set(it.t.artist.id, c + 1);
    seen.add(it.t.id).add(key);
    picked.push(it);
    if (picked.length >= n) break;
  }
  // Spread repeats of an artist apart.
  for (let i = 1; i < picked.length; i++) {
    if (picked[i].t.artist.id !== picked[i - 1].t.artist.id) continue;
    const j = picked.findIndex(
      (x, k) => k > i && x.t.artist.id !== picked[i - 1].t.artist.id && x.t.artist.id !== picked[i + 1]?.t.artist.id,
    );
    if (j > 0) [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked.map(({ t, reason }) => ({ ...t, reason }));
}

export class RecEngine {
  private expanding = new Map<string, Promise<void>>();
  private linkedGroups = new Set<string>();
  private homeCache = new TtlCache<HomeRecs>(10 * 60_000, 500);
  private starterCache = new TtlCache<HomeRecs>(30 * 60_000, 1);

  constructor(
    private music: Music,
    private catalog: Catalog,
    private coplay: CoPlay,
    private seedGroups: SeedGroup[],
  ) {}

  /** Learns an artist's catalog by searching their name (once a day at most). */
  expand(name: string, artistId?: string, pages = 1): Promise<void> {
    const id = artistId ?? this.catalog.artistIdByName(name);
    const node = id ? this.catalog.artists.get(id) : undefined;
    const deep = pages > 1;
    const last = deep ? node?.deepAt : node?.expandedAt;
    if (!name || (last && Date.now() - last < DAY)) return Promise.resolve();
    const key = `${id ?? `name:${name.toLowerCase()}`}:${deep ? "deep" : "basic"}`;
    const running = this.expanding.get(key);
    if (running) return running;

    const task = (async () => {
      const first = await this.music.search(name, 0);
      if (pages > 1) {
        await Promise.allSettled([
          first.offset + first.limit < first.total ? this.music.search(name, first.offset + first.limit) : null,
          // Surfaces songs where this artist is featured, revealing collaborators.
          this.music.search(`feat ${name}`, 0),
        ]);
      }
      const resolved = id ?? this.catalog.artistIdByName(name);
      if (resolved) this.catalog.markExpanded(resolved, deep);
    })().finally(() => this.expanding.delete(key));
    this.expanding.set(key, task);
    return task;
  }

  /** Expands artists plus the not-yet-seen artists featured on their songs. */
  private async learn(artists: { id: string; name: string }[], ms: number, pages = 2) {
    // Only artists already in the catalog are looked up, using the catalog's own name,
    // so a request can't make the server search for arbitrary text.
    const known = artists.flatMap((a) => {
      const node = this.catalog.artists.get(a.id);
      return node ? [{ id: node.id, name: node.name }] : [];
    });
    if (!known.length) return;
    artists = known;
    await within(ms * 0.6, artists.map((a) => this.expand(a.name, a.id, pages)));
    const featured = [...new Set(artists.flatMap((a) => this.catalog.pendingNamesFor(a.id)))].slice(0, 8);
    await within(ms * 0.4, featured.map((n) => this.expand(n)));
  }

  /** Learns about artists in the background as people listen, so home loads fast. */
  warm(artistIds: string[]) {
    const artists = [...new Set(artistIds)]
      .map((id) => this.catalog.artists.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .slice(0, 5);
    if (artists.length) this.learn(artists, 15_000).catch(() => {});
  }

  /** Related artists with strength 0..1, from the knowledge and co-listening graphs. */
  related(artistId: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const [k, w] of this.catalog.related.get(artistId) ?? []) out.set(k, w);
    for (const [k, w] of this.coplay.artists.get(artistId) ?? []) out.set(k, (out.get(k) ?? 0) + 2 * w);
    // Weak tie to popular artists in the same main genre fills gaps in a young graph.
    const genre = this.catalog.topGenre(artistId);
    for (const { id, pop } of (genre && this.catalog.genreIndex().get(genre)?.slice(0, 10)) || []) {
      out.set(id, (out.get(id) ?? 0) + 0.3 * pop);
    }
    out.delete(artistId);
    return normalizeMap(out);
  }

  private topRelated(artistId: string, n: number) {
    return [...this.related(artistId)]
      .filter(([id]) => this.catalog.artists.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  private nameOf(id: string) {
    return this.catalog.artists.get(id)?.name ?? "";
  }

  private ctx(p: Profile, adventure = p.adventure): Ctx {
    const artistAff = normalizeMap(new Map(p.artists.map((a) => [a.id, Math.max(0, a.w)])));
    const relAff = new Map<string, { w: number; via: string }>();
    for (const a of p.artists.slice(0, 15)) {
      const aff = artistAff.get(a.id) ?? 0;
      for (const [b, w] of this.related(a.id)) {
        if (artistAff.has(b)) continue;
        const score = aff * w;
        if (score > (relAff.get(b)?.w ?? 0)) relAff.set(b, { w: score, via: a.name });
      }
    }
    const maxRel = Math.max(0, ...[...relAff.values()].map((v) => v.w));
    if (maxRel > 0) for (const v of relAff.values()) v.w /= maxRel;

    const coplay = new Map<string, number>();
    for (const s of [...p.seeds, ...p.top.slice(0, 10)]) {
      for (const [t, w] of this.coplay.tracks.get(s.id) ?? []) coplay.set(t, (coplay.get(t) ?? 0) + w);
    }

    return {
      artistAff,
      relAff,
      genreAff: normalizeMap(new Map(p.genres.map((g) => [g.name, Math.max(0, g.w)]))),
      coplay: normalizeMap(coplay),
      heard: new Set(p.heard),
      skipped: new Set(p.skippedArtists),
      adventure,
    };
  }

  private score(t: Track, c: Ctx): Scored {
    const a = c.artistAff.get(t.artist.id) ?? 0;
    const rel = c.relAff.get(t.artist.id);
    const r = rel?.w ?? 0;
    const g = t.genre ? (c.genreAff.get(t.genre) ?? 0) : 0;
    const co = c.coplay.get(t.id) ?? 0;
    const pop = this.catalog.popularity.get(t.id) ?? 0.3;
    const fresh = recency(t.album.releaseDate);
    const adv = c.adventure;

    const familiar = 0.55 * a + 0.15 * g + 0.1 * r;
    const discover = 0.5 * r + 0.2 * g + 0.1 * (1 - a) - 0.25 * a;
    let s = (1 - adv) * familiar + adv * discover + 0.2 * co + 0.12 * pop + 0.06 * fresh;
    if (c.heard.has(t.id)) s -= 0.12 + 0.35 * adv;
    if (c.skipped.has(t.artist.id)) s -= 0.4;

    let reason = "Popular right now";
    if (co > 0.3) reason = "Listeners with your taste play this";
    else if (a > 0.35) reason = `Because you play ${t.artist.name}`;
    else if (r > 0.15 && rel) reason = `Close to ${rel.via}`;
    else if (g > 0.4 && t.genre) reason = `Fits your ${t.genre} taste`;
    else if (fresh > 0.8) reason = "New release";
    return { t, s, reason };
  }

  private freqs(n: number) {
    if (n <= 1) return [88.1];
    return Array.from({ length: n }, (_, i) => Math.round((88.1 + (i * (107.9 - 88.1)) / (n - 1)) * 10) / 10);
  }

  async home(p: Profile): Promise<HomeRecs> {
    if (!p.artists.some((a) => this.catalog.artists.has(a.id))) return this.starters();
    const key = JSON.stringify([
      p.artists.slice(0, 12).map((a) => [a.id, Math.round(a.w * 10)]),
      Math.round(p.adventure * 10),
      p.seeds.slice(0, 3).map((s) => s.id),
    ]);
    // The cached part is built only from server data; the listener's own songs are
    // added per request so nothing one visitor sends can reach another.
    const shared = await this.homeCache.wrap(key, () => this.buildHome(p));
    if (p.top.length < 5) return shared;
    const rotation: Omit<Station, "freq"> = {
      id: "rotation",
      kind: "rotation",
      name: "On repeat",
      reason: "The songs you keep coming back to",
      tracks: p.top.slice(0, 25).map((t) => ({ ...t, reason: "" })),
    };
    const stations = [rotation, ...shared.stations];
    const f = this.freqs(stations.length);
    return { ...shared, stations: stations.map((s, i) => ({ ...s, freq: f[i] })) };
  }

  private async buildHome(p: Profile): Promise<HomeRecs> {
    const top = p.artists.filter((a) => this.catalog.artists.has(a.id)).slice(0, 8);
    await this.learn(top, 8000);

    let c = this.ctx(p);
    const relTop = [...c.relAff].sort((x, y) => y[1].w - x[1].w).slice(0, 10);
    await within(5000, relTop.map(([id]) => this.expand(this.nameOf(id), id)));
    c = this.ctx(p);

    const stations: Omit<Station, "freq">[] = [];

    // Mixes: one per cluster of artists that are related to each other.
    const used = new Set<string>();
    const clusters: string[][] = [];
    for (const a of top) {
      if (used.has(a.id) || clusters.length >= 3) continue;
      const group = [a.id];
      used.add(a.id);
      const rel = this.related(a.id);
      for (const b of top) {
        if (group.length >= 3) break;
        if (!used.has(b.id) && (rel.get(b.id) ?? 0) > 0) {
          group.push(b.id);
          used.add(b.id);
        }
      }
      clusters.push(group);
    }
    clusters.forEach((group, i) => {
      const members = new Set(group);
      const near = new Map<string, number>();
      for (const id of group) for (const [b, w] of this.topRelated(id, 6)) near.set(b, Math.max(near.get(b) ?? 0, w));
      const pool = [...members, ...near.keys()].flatMap((id) => this.catalog.tracksOf(id));
      const scored = pool.map((t) => {
        const x = this.score(t, c);
        x.s += members.has(t.artist.id) ? 0.3 * (1 - c.adventure) : 0.25 * (near.get(t.artist.id) ?? 0) * (0.5 + c.adventure);
        return x;
      });
      const names = group.map((id) => this.nameOf(id)).filter(Boolean);
      stations.push({
        id: `mix-${i + 1}`,
        kind: "mix",
        name: names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : `${names[0]} & more`,
        reason: `Built around ${names.join(", ")}, with artists close to them`,
        tracks: diversify(scored, 25, 4),
      });
    });

    // Genre radio for the strongest genre.
    const topGenre = p.genres[0]?.name;
    if (topGenre) {
      const pool = [...this.catalog.tracks.values()].filter((t) => t.genre === topGenre);
      const tracks = diversify(
        pool.map((t) => this.score(t, c)),
        20,
        2,
      );
      if (tracks.length >= 8) {
        stations.push({
          id: "genre",
          kind: "genre",
          name: `${topGenre} radio`,
          reason: `Your most-played genre, across many artists`,
          tracks,
        });
      }
    }

    // Deep cuts: lesser-played songs from artists you love.
    const deepPool = top
      .slice(0, 6)
      .flatMap((a) => this.catalog.tracksOf(a.id))
      .filter((t) => !c.heard.has(t.id) && (this.catalog.popularity.get(t.id) ?? 0) < 0.8);
    const deep = diversify(
      deepPool.map((t) => ({ ...this.score(t, c), reason: `A deeper ${t.artist.name} cut` })),
      20,
      4,
    );
    if (deep.length >= 6) {
      stations.push({ id: "deep", kind: "deep", name: "Deep cuts", reason: "Songs you haven't heard yet from artists you already love", tracks: deep });
    }

    // Fresh: recent releases from your artists and their circle.
    const freshPool = [...top.map((a) => a.id), ...relTop.map(([id]) => id)]
      .flatMap((id) => this.catalog.tracksOf(id))
      .filter((t) => recency(t.album.releaseDate) > 0.75);
    const fresh = diversify(
      freshPool.map((t) => {
        const x = this.score(t, c);
        return { ...x, s: x.s + recency(t.album.releaseDate), reason: `New from ${t.artist.name}` };
      }),
      20,
      3,
    );
    if (fresh.length >= 5) {
      stations.push({ id: "fresh", kind: "fresh", name: "Fresh finds", reason: "Recent releases from artists you play and their circle", tracks: fresh });
    }

    // Uncharted: two steps out on the graph, artists you've never played.
    const twoStep = new Map<string, { w: number; via: string }>();
    for (const [id, { w }] of relTop.slice(0, 6)) {
      for (const [b, w2] of this.topRelated(id, 5)) {
        if (c.artistAff.has(b) || c.relAff.has(b)) continue;
        const score = w * w2;
        if (score > (twoStep.get(b)?.w ?? 0)) twoStep.set(b, { w: score, via: this.nameOf(id) });
      }
    }
    const farTop = [...twoStep].sort((a, b) => b[1].w - a[1].w).slice(0, 8);
    await within(4000, farTop.map(([id]) => this.expand(this.nameOf(id), id)));
    const far = this.ctx(p, 1);
    const farPool = [...relTop.slice(4).map(([id]) => id), ...farTop.map(([id]) => id)].flatMap((id) => this.catalog.tracksOf(id));
    const uncharted = diversify(
      farPool
        .filter((t) => !c.artistAff.has(t.artist.id))
        .map((t) => {
          const x = this.score(t, far);
          const via = twoStep.get(t.artist.id)?.via ?? c.relAff.get(t.artist.id)?.via;
          return { ...x, s: x.s + (twoStep.get(t.artist.id)?.w ?? 0), reason: via ? `Further out from ${via}` : x.reason };
        }),
      20,
      2,
    );
    if (uncharted.length >= 5) {
      stations.push({ id: "uncharted", kind: "uncharted", name: "Uncharted", reason: "Artists you've never played, a step or two from your favourites", tracks: uncharted });
    }

    const f = this.freqs(stations.length);
    const rows: HomeRecs["rows"] = [];
    for (const seed of p.seeds.filter((s) => this.catalog.tracks.has(s.id)).slice(0, 2)) {
      const tracks = await this.radio(seed, p, [], 12);
      if (tracks.length >= 4) rows.push({ title: `Because you played ${seed.title}`, reason: `Similar to ${seed.artist.name}`, tracks });
    }

    const lead = top[0];
    const fans = this.topRelated(lead.id, 12).map(([id]) => {
      const node = this.catalog.artists.get(id)!;
      return { id, name: node.name, image: node.image, genre: this.catalog.topGenre(id) };
    });

    return {
      personalized: true,
      stations: stations.map((s, i) => ({ ...s, freq: f[i] })),
      rows,
      artists: fans.length ? { title: `Fans of ${lead.name} also like`, items: fans } : null,
      starters: [],
    };
  }

  /** Cold start: curated starting points until the listener has some history. */
  async starters(): Promise<HomeRecs> {
    const result = await this.starterCache.wrap("starters", async () => {
      const names = this.seedGroups.flatMap((g) => g.artists);
      await within(12_000, names.map((n) => this.expand(n)));
      const starters: ArtistRef[] = [];
      const stations = this.seedGroups.flatMap((g) => {
        const ids = g.artists.map((n) => this.catalog.artistIdByName(n)).filter((id): id is string => !!id);
        // Hand-picked groups are a strong editorial signal that these artists belong together.
        if (!this.linkedGroups.has(g.name) && ids.length === g.artists.length) {
          ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => this.catalog.link(a, b, 2)));
          this.linkedGroups.add(g.name);
        }
        for (const id of ids) {
          const node = this.catalog.artists.get(id)!;
          starters.push({ id, name: node.name, image: node.image, genre: this.catalog.topGenre(id) });
        }
        const scored = ids.flatMap((id) =>
          this.catalog
            .tracksOf(id)
            .map((t) => ({ t, s: this.catalog.popularity.get(t.id) ?? 0, reason: "" })),
        );
        const tracks = diversify(scored, 20, 5);
        return tracks.length >= 4
          ? [{ id: `starter-${g.name.toLowerCase().replace(/\W+/g, "-")}`, kind: "starter" as const, name: g.name, reason: "A starting point. Play, like and skip songs to tune Wavely to you", tracks }]
          : [];
      });
      const f = this.freqs(stations.length);
      return {
        personalized: false,
        stations: stations.map((s, i) => ({ ...s, freq: f[i] })),
        rows: [],
        artists: null,
        starters,
      };
    });
    // Keep retrying on later visits until every starting point has loaded.
    if (result.stations.length < this.seedGroups.length) this.starterCache.delete("starters");
    return result;
  }

  /** Endless radio from one song: same artist, close artists, and co-listened songs. */
  async radio(clientSeed: Track, p?: Profile, exclude: string[] = [], n = 25): Promise<Rec[]> {
    // Trust the catalog's copy of the song, never the one the browser sent.
    const seed = this.catalog.tracks.get(clientSeed.id);
    if (!seed) return [];
    await this.learn([seed.artist], 6000);
    const rel = this.topRelated(seed.artist.id, 8);
    await within(5000, rel.map(([id]) => this.expand(this.nameOf(id), id)));

    const relW = new Map(this.topRelated(seed.artist.id, 10));
    const co = normalizeMap(new Map(this.coplay.tracks.get(seed.id) ?? []));
    const c = p ? this.ctx(p) : null;
    const skip = new Set([...exclude, seed.id]);
    const seedYear = Number(seed.album.releaseDate?.slice(0, 4)) || 0;

    const pool = new Map<string, Track>();
    for (const id of [seed.artist.id, ...relW.keys()]) for (const t of this.catalog.tracksOf(id)) pool.set(t.id, t);
    for (const id of co.keys()) {
      const t = this.catalog.tracks.get(id);
      if (t) pool.set(id, t);
    }

    const seedKey = baseTitle(seed);
    const scored = [...pool.values()]
      // Leave out the seed itself and any other version of it (remixes, re-releases).
      .filter((t) => !skip.has(t.id) && !(t.artist.id === seed.artist.id && baseTitle(t) === seedKey))
      .map((t) => {
        const same = t.artist.id === seed.artist.id;
        const r = relW.get(t.artist.id) ?? 0;
        const genre = t.genre && t.genre === seed.genre ? 1 : 0;
        const year = Number(t.album.releaseDate?.slice(0, 4)) || 0;
        const era = seedYear && year ? Math.max(0, 1 - Math.abs(seedYear - year) / 15) : 0.5;
        const cp = co.get(t.id) ?? 0;
        const pop = this.catalog.popularity.get(t.id) ?? 0.3;
        const sim = (same ? 0.35 : 0) + 0.5 * r + 0.2 * genre + 0.1 * era + 0.45 * cp + 0.1 * pop;
        const personal = c ? this.score(t, c) : null;
        const reason = cp > 0.3 ? "Often played after this" : same ? `More from ${t.artist.name}` : `Close to ${seed.artist.name}`;
        return { t, s: personal ? 0.7 * sim + 0.3 * personal.s : sim, reason };
      });
    return diversify(scored, n, 4);
  }

  /** Artists related to one artist, for "Fans also play". */
  async relatedArtists(artistId: string): Promise<ArtistRef[]> {
    const node = this.catalog.artists.get(artistId);
    if (!node) return [];
    const name = node.name;
    await this.learn([{ id: artistId, name }], 6000);
    const rel = this.topRelated(artistId, 12);
    return rel.map(([id, w]) => {
      const node = this.catalog.artists.get(id)!;
      const direct = (this.catalog.related.get(artistId)?.get(id) ?? 0) >= 3;
      return {
        id,
        name: node.name,
        image: node.image,
        genre: this.catalog.topGenre(id),
        reason: direct ? `Collaborated with ${name}` : w > 0.5 ? `Often alongside ${name}` : undefined,
      };
    });
  }
}
