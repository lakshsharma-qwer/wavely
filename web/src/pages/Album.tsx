import { Radio } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { CollectionHeader, PlayAllButton } from "../components/CollectionHeader";
import { TrackList } from "../components/TrackList";
import { Btn, Cover, ErrorState } from "../components/ui";
import { artistPath, useApi } from "../lib/api";
import { formatTotal, plural, year } from "../lib/format";
import type { AlbumResponse } from "../lib/types";
import { usePlayer } from "../store/player";

export default function Album() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data, error, loading } = useApi<AlbumResponse>(`/api/album/${encodeURIComponent(id)}?q=${encodeURIComponent(q)}`);

  if (loading) return <PageSkeleton />;
  if (error || !data) return <ErrorState message={error ?? "This album couldn't be found."} />;

  const { album, artist, tracks } = data;
  const total = tracks.reduce((sum, t) => sum + t.duration, 0);
  const genre = tracks.find((t) => t.genre)?.genre;

  return (
    <div>
      <CollectionHeader
        kind={genre ? `Album · ${genre}` : "Album"}
        title={album.title}
        backdrop={album.cover}
        art={<Cover src={album.cover} alt={album.title} className="size-full" />}
        meta={
          <>
            <Link to={artistPath(artist)} className="text-paper hover:text-amber">
              {artist.name}
            </Link>
            {album.releaseDate && <span>· {year(album.releaseDate)}</span>}
            <span>· {plural(tracks.length, "song")}</span>
            <span>· {formatTotal(total)}</span>
          </>
        }
      />
      <div className="px-4 md:px-8">
        <div className="flex items-center gap-3 py-6">
          <PlayAllButton tracks={tracks} />
          <Btn onClick={() => void usePlayer.getState().startRadio(tracks[0])}>
            <Radio className="size-4 text-amber" /> Album radio
          </Btn>
        </div>
        <TrackList tracks={tracks} variant="album" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="px-4 pt-14 md:px-8">
      <div className="flex flex-col items-start gap-8 md:flex-row md:items-end">
        <div className="skeleton size-44 rounded-[6px] md:size-56" />
        <div className="w-full space-y-4">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-14 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
        </div>
      </div>
      <div className="mt-12 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
