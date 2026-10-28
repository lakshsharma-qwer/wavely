import { z } from "zod";
import type { MusicProvider, SearchPage, Track } from "../types.js";

// Mirrors the provider contract used by Beatsync's own server
// (packages/shared/types/provider.ts in freeman-jiang/beatsync).

const RawTrackSchema = z.object({
  id: z.number(),
  title: z.string(),
  version: z.string().nullable().optional(),
  duration: z.number(),
  parental_warning: z.boolean(),
  track_number: z.number(),
  performer: z.object({ id: z.number(), name: z.string() }),
  composer: z.object({ name: z.string() }).nullable().optional(),
  album: z.object({
    id: z.string(),
    title: z.string(),
    image: z.object({ small: z.string(), thumbnail: z.string(), large: z.string() }),
    release_date_original: z.string().optional(),
    genre: z.object({ name: z.string() }).nullable().optional(),
  }),
});

const RawSearchSchema = z.object({
  data: z.object({
    tracks: z.object({
      limit: z.number(),
      offset: z.number(),
      total: z.number(),
      items: z.array(z.unknown()),
    }),
  }),
});

const RawStreamSchema = z.object({
  success: z.boolean(),
  data: z.object({ url: z.string() }),
});

function normalize(raw: z.infer<typeof RawTrackSchema>): Track {
  const version = raw.version?.trim();
  return {
    id: String(raw.id),
    title: version ? `${raw.title} (${version})` : raw.title,
    artist: { id: String(raw.performer.id), name: raw.performer.name },
    album: {
      id: raw.album.id,
      title: raw.album.title,
      cover: raw.album.image.large,
      coverSmall: raw.album.image.small || raw.album.image.thumbnail,
      releaseDate: raw.album.release_date_original,
    },
    duration: raw.duration,
    explicit: raw.parental_warning,
    trackNumber: raw.track_number,
    genre: raw.album.genre?.name,
    composer: raw.composer?.name,
  };
}

/** Parses Beatsync's raw search payload into normalized tracks. */
export function parseSearchPage(payload: unknown): SearchPage {
  const { tracks } = RawSearchSchema.parse(payload).data;
  // Validate items one by one so a single odd record doesn't sink the whole page.
  const items = tracks.items.flatMap((item) => {
    const parsed = RawTrackSchema.safeParse(item);
    return parsed.success ? [normalize(parsed.data)] : [];
  });
  return { items, total: tracks.total, offset: tracks.offset, limit: tracks.limit };
}

export class BeatsyncProvider implements MusicProvider {
  readonly name = "beatsync";

  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Beatsync provider ${path} responded ${res.status}`);
    return res.json();
  }

  async search(query: string, offset: number): Promise<SearchPage> {
    return parseSearchPage(await this.get("/api/search", { q: query, offset: String(offset) }));
  }

  async getStreamUrl(trackId: string): Promise<string> {
    const raw = RawStreamSchema.parse(await this.get("/api/track", { id: trackId }));
    if (!raw.success) throw new Error(`Beatsync provider could not stream track ${trackId}`);
    return raw.data.url;
  }
}
