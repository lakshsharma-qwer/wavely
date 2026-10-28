import { Radio } from "lucide-react";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { AlbumCard, ArtistCard, CardRow, CardSkeletons } from "../components/Cards";
import { PlayAllButton } from "../components/CollectionHeader";
import { TrackList } from "../components/TrackList";
import { Btn, ErrorState, Section } from "../components/ui";
import { useApi } from "../lib/api";
import type { ArtistRef, ArtistResponse } from "../lib/types";
import { usePlayer } from "../store/player";
import { PageSkeleton } from "./Album";

export default function Artist() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";
  const [expanded, setExpanded] = useState(false);
  const { data, error, loading } = useApi<ArtistResponse>(`/api/artist/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`);
  const related = useApi<{ artists: ArtistRef[] }>(
    name ? `/api/recs/artist/${encodeURIComponent(id)}/related?name=${encodeURIComponent(name)}` : null,
  );
  const radioLoading = usePlayer((s) => s.radioLoading);

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error ?? "This artist couldn't be found."} />;

  const { artist, tracks, albums } = data;
  const genre = tracks.find((t) => t.genre)?.genre;

  return (
    <div>
      <header className="relative isolate flex min-h-[320px] items-end overflow-hidden px-4 pb-8 pt-24 md:min-h-[400px] md:px-8">
        <img src={artist.image} alt="" aria-hidden className="absolute inset-0 -z-20 size-full object-cover opacity-55" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-panel via-panel/60 to-panel/10" />
        <div className="min-w-0">
          <p className="t-label text-amber">{genre ? `Artist · ${genre}` : "Artist"}</p>
          <h1 className="t-wide mt-3 break-words text-5xl uppercase md:text-7xl xl:text-8xl">{artist.name}</h1>
        </div>
      </header>

      <div className="px-4 md:px-8">
        <div className="flex items-center gap-3 py-6">
          <PlayAllButton tracks={tracks} label={`Play ${artist.name}`} />
          <Btn disabled={radioLoading} onClick={() => void usePlayer.getState().startRadio(tracks[0])}>
            <Radio className="size-4 text-amber" /> {radioLoading ? "Loading…" : "Artist radio"}
          </Btn>
        </div>

        <Section title="Popular">
          <TrackList tracks={expanded ? tracks : tracks.slice(0, 5)} playList={tracks} variant="compact" />
          {tracks.length > 5 && (
            <button onClick={() => setExpanded(!expanded)} className="t-label mt-3 px-3 text-dust hover:text-amber">
              {expanded ? "Show less" : `Show all ${tracks.length}`}
            </button>
          )}
        </Section>

        {related.loading ? (
          <Section title="Fans also like">
            <CardSkeletons count={5} />
          </Section>
        ) : (
          !!related.data?.artists.length && (
            <Section title="Fans also like">
              <CardRow>
                {related.data.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </CardRow>
            </Section>
          )
        )}

        {albums.length > 0 && (
          <Section title="Discography">
            <CardRow>
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} artist={artist} />
              ))}
            </CardRow>
          </Section>
        )}
      </div>
    </div>
  );
}
