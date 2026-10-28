import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { albumPath, artistPath } from "../lib/api";
import { year } from "../lib/format";
import type { Album, Artist, ArtistRef, Track } from "../lib/types";
import { useCurrentTrack, usePlayer } from "../store/player";
import { Cover, PlayButton } from "./ui";

/** A horizontally scrolling shelf, like flipping through a crate. */
export function CardRow({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-40px),transparent)]">
      {children}
    </div>
  );
}

const sleeve = "group relative w-36 shrink-0 snap-start md:w-44";

export function TrackCard({ track, list, index }: { track: Track; list: Track[]; index: number }) {
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const active = current?.id === track.id;
  const play = () => (active ? usePlayer.getState().togglePlay() : usePlayer.getState().playTracks(list, index));

  return (
    <div className={`${sleeve} cursor-pointer`} onClick={play}>
      <div className="relative mb-3 transition-transform duration-300 group-hover:-translate-y-1">
        <Cover src={track.album.cover} alt={track.album.title} className="aspect-square w-full shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)]" />
        <PlayButton
          size="sm"
          playing={active && isPlaying}
          onClick={play}
          className={`absolute bottom-2 left-2 transition-all duration-200 ${active ? "" : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"}`}
        />
      </div>
      <p className={`truncate text-[15px] font-semibold ${active ? "text-amber" : ""}`}>{track.title}</p>
      <Link to={artistPath(track.artist)} onClick={(e) => e.stopPropagation()} className="block truncate text-sm text-dust hover:text-paper hover:underline">
        {track.artist.name}
      </Link>
    </div>
  );
}

export function AlbumCard({ album, artist }: { album: Album; artist: Artist }) {
  const navigate = useNavigate();
  return (
    <Link to={albumPath(album, artist)} className={sleeve}>
      <Cover
        src={album.cover}
        alt={album.title}
        className="mb-3 aspect-square w-full shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)] transition-transform duration-300 group-hover:-translate-y-1"
      />
      <p className="truncate text-[15px] font-semibold">{album.title}</p>
      <p className="truncate text-sm text-dust">
        <span
          role="link"
          onClick={(e) => {
            e.preventDefault();
            navigate(artistPath(artist));
          }}
          className="hover:text-paper hover:underline"
        >
          {artist.name}
        </span>
        {album.releaseDate && <span className="t-num text-xs text-dim"> · {year(album.releaseDate)}</span>}
      </p>
    </Link>
  );
}

export function ArtistCard({ artist, onClick, selected }: { artist: ArtistRef; onClick?: () => void; selected?: boolean }) {
  const body = (
    <>
      <div className="relative mb-3">
        <Cover
          src={artist.image}
          alt={artist.name}
          round
          className={`aspect-square w-full transition duration-300 group-hover:scale-[1.03] ${selected ? "ring-4 ring-amber ring-offset-4 ring-offset-base" : ""}`}
        />
      </div>
      <p className="truncate text-center text-[15px] font-semibold">{artist.name}</p>
      <p className="t-label truncate text-center text-[9.5px] text-dim">{artist.genre ?? "Artist"}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={`${sleeve} w-32 text-left md:w-36`}>
        {body}
      </button>
    );
  }
  return (
    <Link to={artistPath(artist)} className={`${sleeve} w-32 md:w-36`}>
      {body}
    </Link>
  );
}

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <CardRow>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={sleeve}>
          <div className="skeleton mb-3 aspect-square w-full rounded-[6px]" />
          <div className="skeleton mb-2 h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      ))}
    </CardRow>
  );
}
