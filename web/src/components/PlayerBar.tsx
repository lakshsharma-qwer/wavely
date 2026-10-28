import {
  ChevronDown,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { albumPath, artistPath } from "../lib/api";
import { formatTime } from "../lib/format";
import { useCurrentTrack, usePlayer } from "../store/player";
import { useTaste } from "../store/taste";
import { Meter } from "./Meter";
import { LikeButton } from "./TrackList";
import { Attribution, Cover, Slider } from "./ui";

function Transport({ large = false, tone = "silver" }: { large?: boolean; tone?: "silver" | "dark" }) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const buffering = usePlayer((s) => s.buffering || s.radioLoading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const { togglePlay, next, prev, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const icon = large ? "size-6" : "size-[18px]";
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const quiet = tone === "silver" ? "text-silver-dim hover:text-silver-ink" : "text-dust hover:text-paper";
  const lit = tone === "silver" ? "text-ember" : "text-amber";

  const toggle = (on: boolean) =>
    `relative rounded-full p-2 transition ${on ? `${lit} after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-current` : quiet}`;

  return (
    <div className={`flex items-center ${large ? "justify-between" : "justify-center gap-3"}`}>
      <button aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle} className={toggle(shuffle)}>
        <Shuffle className={icon} />
      </button>
      <button aria-label="Previous" disabled={!hasTrack} onClick={prev} className={`p-2 disabled:opacity-40 ${quiet}`}>
        <SkipBack className={icon} fill="currentColor" />
      </button>
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!hasTrack}
        onClick={togglePlay}
        className={`knob flex items-center justify-center rounded-full transition hover:scale-105 active:scale-95 disabled:opacity-50 ${large ? "size-[72px]" : "size-11"}`}
      >
        {buffering && isPlaying ? (
          <Loader2 className={`${icon} animate-spin`} />
        ) : isPlaying ? (
          <Pause className={icon} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play className={`${icon} translate-x-px`} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <button aria-label="Next" disabled={!hasTrack} onClick={() => next()} className={`p-2 disabled:opacity-40 ${quiet}`}>
        <SkipForward className={icon} fill="currentColor" />
      </button>
      <button aria-label={`Repeat: ${repeat}`} onClick={cycleRepeat} className={toggle(repeat !== "off")}>
        <RepeatIcon className={icon} />
      </button>
    </div>
  );
}

function Progress({ tone = "silver" }: { tone?: "silver" | "dark" }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const [preview, setPreview] = useState<number | null>(null);
  const time = tone === "silver" ? "text-silver-dim" : "text-dim";

  return (
    <div className={`t-num flex w-full items-center gap-3 text-[10px] ${time}`}>
      <span className="w-10 text-right">{formatTime(preview ?? position)}</span>
      <Slider label="Seek" tone={tone} value={position} max={duration} onCommit={seek} onPreview={setPreview} />
      <span className="w-10">{formatTime(duration)}</span>
    </div>
  );
}

function Volume() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const { setVolume, toggleMute } = usePlayer.getState();
  const level = muted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex w-32 items-center gap-1">
      <button aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute} className="p-1.5 text-silver-dim hover:text-silver-ink">
        <Icon className="size-[18px]" />
      </button>
      <Slider label="Volume" tone="silver" value={level} max={1} onCommit={setVolume} onPreview={(v) => v !== null && setVolume(v)} />
    </div>
  );
}

function AutoplaySwitch({ tone = "silver" }: { tone?: "silver" | "dark" }) {
  const autoplay = useTaste((s) => s.autoplay);
  const off = tone === "silver" ? "text-silver-dim hover:text-silver-ink" : "text-dust hover:text-paper";
  return (
    <button
      aria-pressed={autoplay}
      title={autoplay ? "Autoplay is on: similar songs play when the queue ends" : "Autoplay is off"}
      onClick={() => useTaste.getState().setAutoplay(!autoplay)}
      className={`flex items-center gap-1.5 rounded-full p-1.5 ${autoplay ? (tone === "silver" ? "text-ember" : "text-amber") : off}`}
    >
      <Radio className="size-[18px]" />
      <span className="t-label hidden text-[9px] xl:inline">Autoplay</span>
    </button>
  );
}

export function PlayerBar() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onQueue = pathname === "/queue";

  return (
    <footer className="faceplate hidden h-[88px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-6 rounded-2xl px-4 md:grid">
      <div className="flex min-w-0 items-center gap-3">
        {track ? (
          <>
            <Cover src={track.album.coverSmall} alt={track.album.title} className="size-14 shrink-0 shadow-md" />
            <div className="min-w-0">
              <p className={`t-label flex items-center gap-1.5 text-[9px] ${isPlaying ? "text-ember" : "text-silver-dim"}`}>
                <span className={`size-1.5 rounded-full ${isPlaying ? "bg-ember shadow-[0_0_6px_rgb(255_91_58)]" : "bg-silver-dim/50"}`} />
                {isPlaying ? "Now playing" : "Paused"}
              </p>
              <Link to={albumPath(track.album, track.artist)} className="block truncate font-semibold hover:underline">
                {track.title}
              </Link>
              <Link to={artistPath(track.artist)} className="block truncate text-sm text-silver-dim hover:text-silver-ink hover:underline">
                {track.artist.name}
              </Link>
            </div>
            <LikeButton track={track} tone="silver" />
          </>
        ) : (
          <p className="t-label text-silver-dim">Nothing playing</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <Transport />
        <Progress />
      </div>

      <div className="flex items-center justify-end gap-3">
        <Meter className="hidden lg:flex" />
        <AutoplaySwitch />
        <button
          aria-label="Queue"
          aria-pressed={onQueue}
          onClick={() => (onQueue ? navigate(-1) : navigate("/queue"))}
          className={`p-1.5 ${onQueue ? "text-ember" : "text-silver-dim hover:text-silver-ink"}`}
        >
          <ListMusic className="size-[18px]" />
        </button>
        <Volume />
      </div>
    </footer>
  );
}

/** Compact deck above the mobile tabs; tap to open the full player. */
export function MiniPlayer() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const [open, setOpen] = useState(false);
  if (!track) return null;

  return (
    <>
      <div onClick={() => setOpen(true)} className="faceplate relative mx-2 flex items-center gap-3 overflow-hidden rounded-xl p-2 md:hidden">
        <Cover src={track.album.coverSmall} alt="" className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.title}</p>
          <p className="truncate text-xs text-silver-dim">{track.artist.name}</p>
        </div>
        <LikeButton track={track} tone="silver" />
        <button
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={(e) => {
            e.stopPropagation();
            usePlayer.getState().togglePlay();
          }}
          className="knob flex size-10 items-center justify-center rounded-full"
        >
          {isPlaying ? <Pause className="size-4" fill="currentColor" strokeWidth={0} /> : <Play className="size-4 translate-x-px" fill="currentColor" strokeWidth={0} />}
        </button>
        <div className="absolute inset-x-3 bottom-0 h-[2px] bg-silver-ink/15">
          <div className="h-full bg-ember" style={{ width: `${duration ? (position / duration) * 100 : 0}%` }} />
        </div>
      </div>
      {open && <NowPlaying onClose={() => setOpen(false)} />}
    </>
  );
}

function NowPlaying({ onClose }: { onClose: () => void }) {
  const track = useCurrentTrack();
  const navigate = useNavigate();
  if (!track) return null;
  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div role="dialog" aria-label="Now playing" className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-base px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
      <img src={track.album.cover} alt="" className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-30 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <button aria-label="Close player" onClick={onClose} className="-ml-2 p-2">
          <ChevronDown className="size-7" />
        </button>
        <p className="t-label truncate px-4 text-dust">{track.album.title}</p>
        <button aria-label="Queue" onClick={() => go("/queue")} className="-mr-2 p-2">
          <ListMusic className="size-6" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-6">
        <Cover src={track.album.cover} alt={track.album.title} className="aspect-square w-full max-w-sm shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]" />
      </div>

      <div className="relative mb-3 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={() => go(albumPath(track.album, track.artist))} className="t-display block max-w-full truncate text-left text-3xl">
            {track.title}
          </button>
          <button onClick={() => go(artistPath(track.artist))} className="mt-1 block max-w-full truncate text-left text-dust">
            {track.artist.name}
          </button>
        </div>
        <LikeButton track={track} size="size-6" />
      </div>

      <div className="relative">
        <Meter tone="dark" segments={24} className="mb-4 w-full [&>span]:flex-1" />
        <Progress tone="dark" />
        <div className="mt-2">
          <Transport large tone="dark" />
        </div>
        <div className="mt-5 flex items-center justify-between">
          <Attribution />
          <AutoplaySwitch tone="dark" />
        </div>
      </div>
    </div>
  );
}
