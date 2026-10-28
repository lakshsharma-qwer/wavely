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
  duration: number;
  explicit: boolean;
  trackNumber: number;
  genre?: string;
  composer?: string;
  /** Why the recommendation engine picked this song, when it did. */
  reason?: string;
}

export type Album = Track["album"];
export type Artist = Track["artist"];

export interface SearchPage {
  items: Track[];
  total: number;
  offset: number;
  limit: number;
}

export interface HomeResponse {
  sections: { title: string; query: string; tracks: Track[] }[];
}

export interface AlbumResponse {
  album: Album;
  artist: Artist;
  tracks: Track[];
}

export interface ArtistResponse {
  artist: Artist & { image: string };
  tracks: Track[];
  albums: Album[];
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export interface ArtistRef {
  id: string;
  name: string;
  image?: string;
  genre?: string;
  reason?: string;
}

export interface Station {
  id: string;
  freq: number;
  kind: "rotation" | "mix" | "genre" | "deep" | "fresh" | "uncharted" | "starter";
  name: string;
  reason: string;
  tracks: Track[];
}

export interface HomeRecs {
  personalized: boolean;
  stations: Station[];
  rows: { title: string; reason: string; tracks: Track[] }[];
  artists: { title: string; items: ArtistRef[] } | null;
  starters: ArtistRef[];
}
