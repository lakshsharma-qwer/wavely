import type { ReactNode } from "react";
import type { Track } from "../lib/types";
import { useCurrentTrack, usePlayer } from "../store/player";
import { PlayButton } from "./ui";

/** Header for album, playlist and liked pages: art, an eyebrow label, a wide title. */
export function CollectionHeader({
  kind,
  title,
  art,
  meta,
  backdrop,
  children,
}: {
  kind: string;
  title: ReactNode;
  art: ReactNode;
  meta: ReactNode;
  backdrop?: string;
  children?: ReactNode;
}) {
  return (
    <header className="relative isolate overflow-hidden px-4 pb-6 pt-10 md:px-8 md:pt-14">
      {backdrop && (
        <img src={backdrop} alt="" aria-hidden className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-25 blur-3xl" />
      )}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-panel to-transparent" />
      <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:gap-8">
        <div className="size-44 shrink-0 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.95)] md:size-56">{art}</div>
        <div className="w-full min-w-0">
          <p className="t-label mb-3 text-amber">{kind}</p>
          <h1 className="t-display break-words text-4xl md:text-6xl xl:text-7xl">{title}</h1>
          <div className="t-label mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-dust">{meta}</div>
        </div>
      </div>
      {children}
    </header>
  );
}

/** Play/pause for a whole list: resumes if the current song came from it. */
export function PlayAllButton({ tracks, label }: { tracks: Track[]; label?: string }) {
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const fromThisList = !!current && tracks.some((t) => t.id === current.id);
  return (
    <PlayButton
      size="lg"
      label={label}
      playing={fromThisList && isPlaying}
      onClick={() => (fromThisList ? usePlayer.getState().togglePlay() : usePlayer.getState().playTracks(tracks, 0))}
    />
  );
}
