import { useEffect, useRef } from "react";
import { streamUrl } from "../lib/api";
import { attachMeter, resumeMeter } from "../lib/meter";
import type { Track } from "../lib/types";
import { useLibrary } from "../store/library";
import { useCurrentTrack, usePlayer } from "../store/player";
import { startEventSync, useTaste } from "../store/taste";

/** Tracks how much of a song was heard, to tell plays, full listens and skips apart. */
interface Listen {
  track: Track;
  maxPos: number;
  played: boolean;
  completed: boolean;
}

const PLAY_AFTER_S = 30;

/** Owns the single <audio> element and keeps it in sync with the player store. */
export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const listen = useRef<Listen | null>(null);
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const seekTo = usePlayer((s) => s.seekTo);
  const atLastTrack = usePlayer((s) => s.index >= 0 && s.index === s.queue.length - 1);
  const repeat = usePlayer((s) => s.repeat);
  const autoplay = useTaste((s) => s.autoplay);
  const addRecent = useLibrary((s) => s.addRecent);

  useEffect(() => startEventSync(), []);

  // The analyser must be created inside a user gesture, so hook the first one.
  useEffect(() => {
    const onGesture = () => {
      if (audioRef.current) attachMeter(audioRef.current);
    };
    window.addEventListener("pointerdown", onGesture, { once: true, capture: true });
    window.addEventListener("keydown", onGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture, { capture: true });
      window.removeEventListener("keydown", onGesture, { capture: true });
    };
  }, []);

  // Close out the previous song's listen and load the new one.
  useEffect(() => {
    const prev = listen.current;
    if (prev && !prev.played && prev.maxPos > 1 && prev.track.id !== track?.id) {
      useTaste.getState().log("skip", prev.track);
    }
    listen.current = track ? { track, maxPos: 0, played: false, completed: false } : null;

    const audio = audioRef.current;
    if (!audio) return;
    if (!track) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }
    audio.src = streamUrl(track);
    usePlayer.getState().setProgress(0, track.duration);
    if (usePlayer.getState().isPlaying) {
      audio.play().catch(() => usePlayer.getState().setPlaying(false));
      addRecent(track);
    }
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (isPlaying && audio.paused) {
      if (!audio.src) audio.src = streamUrl(track);
      resumeMeter();
      audio.play().catch(() => usePlayer.getState().setPlaying(false));
      addRecent(track);
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get the upcoming song ready so skipping to it is instant.
  const upcomingId = usePlayer((s) => s.queue[s.index + 1]?.id);
  useEffect(() => {
    if (!upcomingId || !isPlaying) return;
    const t = setTimeout(() => {
      fetch(`/api/tracks/${upcomingId}/prepare`, { method: "POST" }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [upcomingId, isPlaying]);

  // On the last song, line up autoplay radio early so the music never stops.
  useEffect(() => {
    if (!atLastTrack || !isPlaying || !autoplay || repeat !== "off") return;
    const t = setTimeout(() => void usePlayer.getState().extendWithRadio(false), 10_000);
    return () => clearTimeout(t);
  }, [atLastTrack, isPlaying, autoplay, repeat, track?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekTo === null) return;
    audio.currentTime = seekTo;
    usePlayer.setState({ seekTo: null });
    if (usePlayer.getState().isPlaying && audio.paused) audio.play().catch(() => {});
  }, [seekTo]);

  // Lock screen / headphone / media key controls.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist.name,
      album: track.album.title,
      artwork: [
        { src: track.album.coverSmall, sizes: "160x160" },
        { src: track.album.cover, sizes: "640x640" },
      ],
    });
    const { togglePlay, next, prev, seek } = usePlayer.getState();
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", togglePlay],
      ["pause", togglePlay],
      ["nexttrack", () => next()],
      ["previoustrack", prev],
      ["seekto", (d) => d.seekTime !== undefined && seek(d.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
  }, [track]);

  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  const onTime = (audio: HTMLAudioElement) => {
    const pos = audio.currentTime;
    usePlayer.getState().setProgress(pos);
    const l = listen.current;
    if (!l) return;
    l.maxPos = Math.max(l.maxPos, pos);
    const duration = Number.isFinite(audio.duration) ? audio.duration : l.track.duration;
    if (!l.played && pos >= Math.min(PLAY_AFTER_S, duration * 0.5)) {
      l.played = true;
      useTaste.getState().log("play", l.track);
    }
    if (!l.completed && duration > 0 && pos >= duration * 0.85) {
      l.completed = true;
      useTaste.getState().log("complete", l.track);
    }
  };

  return (
    <audio
      ref={audioRef}
      preload="auto"
      onTimeUpdate={(e) => onTime(e.currentTarget)}
      onLoadedMetadata={(e) => {
        const d = e.currentTarget.duration;
        if (Number.isFinite(d)) usePlayer.getState().setProgress(e.currentTarget.currentTime, d);
      }}
      onPlay={resumeMeter}
      onWaiting={() => usePlayer.getState().setBuffering(true)}
      onPlaying={() => usePlayer.getState().setBuffering(false)}
      onCanPlay={() => usePlayer.getState().setBuffering(false)}
      onEnded={() => usePlayer.getState().next(true)}
      onError={() => {
        if (!track) return;
        const { setError, setPlaying, setBuffering } = usePlayer.getState();
        setBuffering(false);
        setPlaying(false);
        setError(`"${track.title}" couldn't be loaded. Pick another song or try again.`);
      }}
    />
  );
}
