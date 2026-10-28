import type { MusicProvider, SearchPage, Track } from "../types.js";

// Offline stand-in used when PROVIDER_URL is not set, so the whole app can be
// developed and tested end to end. Audio: SoundHelix example tracks.

const ARTISTS = [
  { id: "101", name: "Neon Harbor" },
  { id: "102", name: "Lumen Drive" },
  { id: "103", name: "The Quiet Static" },
  { id: "104", name: "Aria Vale" },
];

const ALBUMS = [
  { id: "a1", title: "Midnight Circuits", artist: 0, year: "2024-03-15", genre: "Electronic" },
  { id: "a2", title: "Golden Hour Tapes", artist: 1, year: "2023-07-01", genre: "Pop" },
  { id: "a3", title: "Paper Satellites", artist: 2, year: "2025-01-20", genre: "Alternative & Indie" },
  { id: "a4", title: "Northern Lights", artist: 3, year: "2022-11-11", genre: "Pop" },
];

const TITLES = [
  "Afterglow", "City Pulse", "Slow Burn", "Electric Dreams",
  "Sunset Boulevard", "Weekend Run", "Static Love", "Ocean Drive",
  "Neon Rain", "Echoes", "Paper Planes", "Daylight",
  "Aurora", "Gravity", "Firefly", "Wildfire",
];

const DURATIONS = [372, 425, 344, 302, 353, 300, 329, 300, 312, 359, 404, 342, 362, 381, 375, 302];

const CATALOG: Track[] = TITLES.map((title, i) => {
  const album = ALBUMS[i % ALBUMS.length];
  const cover = `https://picsum.photos/seed/wavely-${album.id}/640`;
  return {
    id: String(i + 1),
    title,
    artist: ARTISTS[album.artist],
    album: {
      id: album.id,
      title: album.title,
      cover,
      coverSmall: cover.replace("/640", "/160"),
      releaseDate: album.year,
    },
    duration: DURATIONS[i],
    explicit: i % 5 === 3,
    trackNumber: Math.floor(i / ALBUMS.length) + 1,
    genre: album.genre,
  };
});

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export class DemoProvider implements MusicProvider {
  readonly name = "demo";

  async search(query: string, offset: number): Promise<SearchPage> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    let items = CATALOG.filter((t) => {
      const haystack = `${t.title} ${t.artist.name} ${t.album.title}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
    // Unmatched queries (e.g. home rows like "chill") still return a stable mix.
    if (items.length === 0) {
      const start = hash(query) % CATALOG.length;
      items = [...CATALOG.slice(start), ...CATALOG.slice(0, start)].slice(0, 10);
    }
    const limit = 20;
    return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
  }

  async getStreamUrl(trackId: string): Promise<string> {
    const n = Number(trackId);
    if (!Number.isInteger(n) || n < 1 || n > CATALOG.length) throw new Error("Unknown demo track");
    return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;
  }
}
