// Normalized shapes the frontend consumes. Providers map their raw data into these,
// so the UI never depends on a specific upstream's format.

export interface Track {
  id: string;
  title: string;
  artist: { id: string; name: string };
  album: {
    id: string;
    title: string;
    cover: string;
    coverSmall: string;
    releaseDate?: string;
  };
  duration: number; // seconds
  explicit: boolean;
  trackNumber: number;
  genre?: string;
  composer?: string;
}

export interface SearchPage {
  items: Track[];
  total: number;
  offset: number;
  limit: number;
}

export interface MusicProvider {
  readonly name: string;
  search(query: string, offset: number): Promise<SearchPage>;
  /** Resolves a (usually short-lived) direct audio URL for a track. */
  getStreamUrl(trackId: string): Promise<string>;
  /** Drops a cached stream URL that turned out to be stale. */
  invalidateStream?(trackId: string): void;
}
