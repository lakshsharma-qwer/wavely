import { ChevronRight, Disc3, ListEnd, ListPlus, ListStart, MoreHorizontal, Plus, Radio, Trash2, User } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { albumPath, artistPath } from "../lib/api";
import type { Track } from "../lib/types";
import { useLibrary } from "../store/library";
import { usePlayer } from "../store/player";
import { toast } from "../store/toast";

const MENU_WIDTH = 240;

export function TrackMenu({ track, onRemove, removeLabel = "Remove from this playlist" }: { track: Track; onRemove?: () => void; removeLabel?: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const playlists = useLibrary((s) => s.playlists);
  const { addToPlaylist, createPlaylist } = useLibrary.getState();

  const close = () => {
    setAnchor(null);
    setShowPlaylists(false);
  };

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    const left = Math.min(anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
    const below = anchor.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 4) : below;
    setPos({ top, left: Math.max(8, left) });
  }, [anchor, showPlaylists]);

  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  const item = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-paper hover:bg-line/70";

  return (
    <>
      <button
        type="button"
        aria-label={`More options for ${track.title}`}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
        className="rounded p-1.5 text-dim opacity-100 hover:text-paper md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
      >
        <MoreHorizontal className="size-5" />
      </button>
      {anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-50 rounded-xl border border-line bg-raised p-1.5 shadow-2xl shadow-black/70"
          >
            {!showPlaylists ? (
              <>
                <button className={item} onClick={act(() => void usePlayer.getState().startRadio(track))}>
                  <Radio className="size-4 text-amber" /> Start radio
                </button>
                <button className={item} onClick={act(() => (usePlayer.getState().addToQueue(track), toast("Added to queue")))}>
                  <ListEnd className="size-4 text-dust" /> Add to queue
                </button>
                <button className={item} onClick={act(() => (usePlayer.getState().playNext(track), toast("Playing next")))}>
                  <ListStart className="size-4 text-dust" /> Play next
                </button>
                <button className={item} onClick={() => setShowPlaylists(true)}>
                  <ListPlus className="size-4 text-dust" /> Add to playlist
                  <ChevronRight className="ml-auto size-4 text-dust" />
                </button>
                {onRemove && (
                  <button className={item} onClick={act(onRemove)}>
                    <Trash2 className="size-4 text-dust" /> {removeLabel}
                  </button>
                )}
                <div className="my-1 h-px bg-line" />
                <button className={item} onClick={act(() => navigate(artistPath(track.artist)))}>
                  <User className="size-4 text-dust" /> Go to artist
                </button>
                <button className={item} onClick={act(() => navigate(albumPath(track.album, track.artist)))}>
                  <Disc3 className="size-4 text-dust" /> Go to album
                </button>
              </>
            ) : (
              <>
                <button
                  className={item}
                  onClick={act(() => {
                    const id = createPlaylist(undefined, [track]);
                    toast("Added to new playlist");
                    navigate(`/playlist/${id}`);
                  })}
                >
                  <Plus className="size-4 text-dust" /> New playlist
                </button>
                {playlists.length > 0 && <div className="my-1 h-px bg-line" />}
                <div className="max-h-64 overflow-y-auto scroll-area">
                  {playlists.map((p) => (
                    <button
                      key={p.id}
                      className={item}
                      onClick={act(() => toast(addToPlaylist(p.id, track) ? `Added to ${p.name}` : `Already in ${p.name}`))}
                    >
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
