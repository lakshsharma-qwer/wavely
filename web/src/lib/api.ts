import { useEffect, useState } from "react";
import type { Album, Artist, Track } from "./types";

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const streamUrl = (track: Track) => `/api/tracks/${track.id}/stream`;

// The provider only exposes search, so album and artist pages carry a search hint.
export const albumPath = (album: Album, artist: Artist) =>
  `/album/${encodeURIComponent(album.id)}?q=${encodeURIComponent(`${album.title} ${artist.name}`)}`;

export const artistPath = (artist: Artist) =>
  `/artist/${encodeURIComponent(artist.id)}?name=${encodeURIComponent(artist.name)}`;

/** Fetches JSON when the url changes; pass null to skip. */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: !!url,
  });

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, error: null, loading: true }));
    getJson<T>(url, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setState({ data: null, error: err.message, loading: false });
      });
    return () => controller.abort();
  }, [url]);

  return state;
}
