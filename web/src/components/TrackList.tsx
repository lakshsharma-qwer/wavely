import { Heart } from "lucide-react";
import { Link } from "react-router";
import { albumPath, artistPath } from "../lib/api";
import { formatTime } from "../lib/format";
import type { Track } from "../lib/types";
import { useIsLiked, useLibrary } from "../store/library";
import { useCurrentTrack, usePlayer } from "../store/player";
import { toast } from "../store/toast";
import { TrackMenu } from "./TrackMenu";
import { Cover, Eq, ExplicitBadge } from "./ui";

export function LikeButton({
  track,
  className = "",
  size = "size-4",
  tone = "dark",
}: {
  track: Track;
  className?: string;
  size?: string;
  tone?: "dark" | "silver";
}) {
  const liked = useIsLiked(track.id);
  const idle = tone === "silver" ? "text-silver-dim hover:text-silver-ink" : "text-dim hover:text-paper";
  return (
    <button
      type="button"
      aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      aria-pressed={liked}
      onClick={(e) => {
        e.stopPropagation();
        toast(useLibrary.getState().toggleLike(track) ? "Saved to Liked Songs" : "Removed from Liked Songs");
      }}
      className={`rounded p-1.5 transition hover:scale-110 ${liked ? "text-ember" : idle} ${className}`}
    >
      <Heart className={size} fill={liked ? "currentColor" : "none"} />
    </button>
  );
}

interface TrackListProps {
  tracks: Track[];
  /** "album" hides covers and the album column and numbers by track number. */
  variant?: "full" | "album" | "compact";
  onRemove?: (track: Track) => void;
  removeLabel?: string;
  /** Plays this list instead of `tracks` (e.g. when showing a slice of a station). */
  playList?: Track[];
}

export function TrackList({ tracks, variant = "full", onRemove, removeLabel, playList }: TrackListProps) {
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const { playTracks, togglePlay } = usePlayer.getState();
  const showAlbum = variant === "full";
  const showCover = variant !== "album";

  const cols = showAlbum
    ? "grid-cols-[1fr_auto] md:grid-cols-[2.25rem_minmax(0,5fr)_minmax(0,3fr)_auto]"
    : "grid-cols-[1fr_auto] md:grid-cols-[2.25rem_minmax(0,1fr)_auto]";

  return (
    <div role="list">
      {tracks.map((track, i) => {
        const active = current?.id === track.id;
        const play = () => (active ? togglePlay() : playTracks(playList ?? tracks, playList ? playList.indexOf(track) : i));
        return (
          <div
            key={`${track.id}-${i}`}
            role="listitem"
            onClick={play}
            className={`group grid cursor-pointer items-center gap-x-4 rounded-lg px-2 py-2 transition-colors md:px-3 ${cols} ${active ? "bg-amber/[0.07]" : "hover:bg-raised/70"}`}
          >
            <span className="t-num hidden w-9 justify-end text-right text-xs text-dim md:flex">
              {active ? <Eq paused={!isPlaying} /> : variant === "album" ? track.trackNumber : String(i + 1).padStart(2, "0")}
            </span>

            <div className="flex min-w-0 items-center gap-3">
              {showCover && <Cover src={track.album.coverSmall} alt="" className="size-11 shrink-0" />}
              <div className="min-w-0">
                <p className={`truncate text-[15px] font-semibold ${active ? "text-amber" : "text-paper"}`}>{track.title}</p>
                <div className="flex min-w-0 items-center gap-3 text-sm text-dust">
                  <span className="flex min-w-0 items-center">
                    {track.explicit && <ExplicitBadge />}
                    <Link to={artistPath(track.artist)} onClick={(e) => e.stopPropagation()} className="truncate hover:text-paper hover:underline">
                      {track.artist.name}
                    </Link>
                  </span>
                </div>
              </div>
            </div>

            {showAlbum && (
              <Link
                to={albumPath(track.album, track.artist)}
                onClick={(e) => e.stopPropagation()}
                className="hidden truncate text-sm text-dust hover:text-paper hover:underline md:block"
              >
                {track.album.title}
              </Link>
            )}

            <div className="flex items-center justify-end gap-1">
              <LikeButton track={track} className="hidden md:block md:opacity-0 md:group-hover:opacity-100 md:aria-pressed:opacity-100" />
              <span className="t-num hidden w-11 text-right text-xs text-dim md:inline">{formatTime(track.duration)}</span>
              <TrackMenu track={track} onRemove={onRemove && (() => onRemove(track))} removeLabel={removeLabel} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
