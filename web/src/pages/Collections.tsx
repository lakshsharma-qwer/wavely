import { Disc3, Heart, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CollectionHeader, PlayAllButton } from "../components/CollectionHeader";
import { TrackList } from "../components/TrackList";
import { Btn, Cover } from "../components/ui";
import { formatTotal, plural } from "../lib/format";
import type { Track } from "../lib/types";
import { useLibrary } from "../store/library";
import { toast } from "../store/toast";

function EmptyList({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="t-head text-2xl">{title}</p>
      <p className="max-w-sm text-dust">{hint}</p>
      <Link to="/search" className="mt-3 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-glass hover:bg-white">
        Search for songs
      </Link>
    </div>
  );
}

function Mosaic({ tracks }: { tracks: Track[] }) {
  const covers = [...new Set(tracks.map((t) => t.album.cover))].slice(0, 4);
  if (covers.length === 0) {
    return (
      <div className="flex size-full items-center justify-center rounded-[6px] bg-raised text-dim">
        <Disc3 className="size-1/3" strokeWidth={1.5} />
      </div>
    );
  }
  if (covers.length < 4) return <Cover src={covers[0]} alt="" className="size-full" />;
  return (
    <div className="grid size-full grid-cols-2 overflow-hidden rounded-[6px]">
      {covers.map((c) => (
        <Cover key={c} src={c} alt="" className="size-full rounded-none" />
      ))}
    </div>
  );
}

const LikedArt = () => (
  <div className="flex size-full items-center justify-center rounded-[6px] bg-[radial-gradient(circle_at_30%_25%,#ff8a5c,#c2321a_55%,#5a1409)]">
    <Heart className="size-1/3 text-paper" fill="currentColor" />
  </div>
);

export function Liked() {
  const liked = useLibrary((s) => s.liked);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const total = liked.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div>
      <CollectionHeader
        kind="Playlist"
        title="Liked Songs"
        art={<LikedArt />}
        meta={
          <>
            <span>{plural(liked.length, "song")}</span>
            {total > 0 && <span>· {formatTotal(total)}</span>}
          </>
        }
      />
      <div className="px-4 md:px-8">
        {liked.length === 0 ? (
          <EmptyList title="No liked songs yet" hint="Tap the heart on any song to save it here." />
        ) : (
          <>
            <div className="py-6">
              <PlayAllButton tracks={liked} />
            </div>
            <TrackList tracks={liked} onRemove={toggleLike} removeLabel="Remove from Liked Songs" />
          </>
        )}
      </div>
    </div>
  );
}

export function PlaylistPage() {
  const { id = "" } = useParams();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const { renamePlaylist, deletePlaylist, removeFromPlaylist } = useLibrary.getState();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(playlist?.name ?? "");
  const navigate = useNavigate();

  useEffect(() => setName(playlist?.name ?? ""), [playlist?.name]);

  if (!playlist) {
    return (
      <div className="py-24 text-center">
        <p className="t-head text-2xl">Playlist not found</p>
        <p className="mt-2 text-dust">Playlists are saved on the device that made them.</p>
      </div>
    );
  }

  const total = playlist.tracks.reduce((sum, t) => sum + t.duration, 0);
  const save = () => {
    renamePlaylist(playlist.id, name);
    setEditing(false);
  };

  return (
    <div>
      <CollectionHeader
        kind="Playlist"
        backdrop={playlist.tracks[0]?.album.cover}
        art={<Mosaic tracks={playlist.tracks} />}
        title={
          editing ? (
            <input
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="Playlist name"
              className="w-full rounded-lg bg-glass/60 px-2 outline-none ring-amber focus:ring-2"
            />
          ) : (
            <button onClick={() => setEditing(true)} className="text-left hover:text-amber" title="Rename playlist">
              {playlist.name}
            </button>
          )
        }
        meta={
          <>
            <span>{plural(playlist.tracks.length, "song")}</span>
            {total > 0 && <span>· {formatTotal(total)}</span>}
          </>
        }
      />
      <div className="px-4 md:px-8">
        <div className="flex items-center gap-2 py-6">
          {playlist.tracks.length > 0 && <PlayAllButton tracks={playlist.tracks} />}
          <button aria-label="Rename playlist" onClick={() => setEditing(true)} className="ml-2 rounded-full p-2.5 text-dust hover:bg-raised hover:text-paper">
            <Pencil className="size-5" />
          </button>
          <button
            aria-label="Delete playlist"
            onClick={() => {
              if (!confirm(`Delete "${playlist.name}"? This can't be undone.`)) return;
              deletePlaylist(playlist.id);
              toast("Playlist deleted");
              navigate("/library");
            }}
            className="rounded-full p-2.5 text-dust hover:bg-raised hover:text-ember"
          >
            <Trash2 className="size-5" />
          </button>
        </div>
        {playlist.tracks.length === 0 ? (
          <EmptyList title="This playlist is empty" hint="Use “Add to playlist” in any song's menu to fill it." />
        ) : (
          <TrackList tracks={playlist.tracks} onRemove={(t) => removeFromPlaylist(playlist.id, t.id)} />
        )}
      </div>
    </div>
  );
}

/** Liked songs and every playlist. */
export function LibraryPage() {
  const playlists = useLibrary((s) => s.playlists);
  const likedCount = useLibrary((s) => s.liked.length);
  const navigate = useNavigate();

  const tile = "group flex flex-col gap-3";
  const art = "aspect-square w-full shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)] transition-transform duration-300 group-hover:-translate-y-1";

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-wide text-4xl md:text-6xl">Your Library</h1>
        </div>
        <Btn tone="amber" onClick={() => navigate(`/playlist/${useLibrary.getState().createPlaylist()}`)}>
          <Plus className="size-4" /> New playlist
        </Btn>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        <Link to="/liked" className={tile}>
          <div className={art}>
            <LikedArt />
          </div>
          <div>
            <p className="font-semibold">Liked Songs</p>
            <p className="t-label text-dim">{plural(likedCount, "song")}</p>
          </div>
        </Link>
        {playlists.map((p) => (
          <Link key={p.id} to={`/playlist/${p.id}`} className={tile}>
            <div className={art}>
              <Mosaic tracks={p.tracks} />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="t-label text-dim">{plural(p.tracks.length, "song")}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
