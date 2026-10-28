import { Radio, X } from "lucide-react";
import { Link } from "react-router";
import { Cover, Eq, ExplicitBadge } from "../components/ui";
import { formatTime } from "../lib/format";
import type { Track } from "../lib/types";
import { usePlayer } from "../store/player";
import { useTaste } from "../store/taste";

function Row({ track, onPlay, onRemove, active }: { track: Track; onPlay: () => void; onRemove?: () => void; active?: boolean }) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  return (
    <div
      onClick={onPlay}
      className={`group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors md:px-3 ${active ? "bg-amber/[0.07]" : "hover:bg-raised/70"}`}
    >
      <Cover src={track.album.coverSmall} alt="" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${active ? "text-amber" : ""}`}>{track.title}</p>
        <p className="flex min-w-0 items-center gap-3 text-sm text-dust">
          <span className="flex min-w-0 items-center truncate">
            {track.explicit && <ExplicitBadge />}
            {track.artist.name}
          </span>
        </p>
      </div>
      {active && <Eq paused={!isPlaying} />}
      <span className="t-num w-11 text-right text-xs text-dim">{formatTime(track.duration)}</span>
      {onRemove && (
        <button
          aria-label={`Remove ${track.title} from queue`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 text-dim hover:text-paper md:opacity-0 md:group-hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export default function Queue() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const radioFrom = usePlayer((s) => s.radioFrom);
  const autoplay = useTaste((s) => s.autoplay);
  const { jumpTo, removeFromQueue, togglePlay } = usePlayer.getState();
  const current = queue[index];
  const upcoming = queue.map((t, i) => ({ t, i })).slice(index + 1);
  const queued = upcoming.filter(({ i }) => radioFrom < 0 || i < radioFrom);
  const fromRadio = upcoming.filter(({ i }) => radioFrom >= 0 && i >= radioFrom);

  const renderRows = (rows: typeof upcoming) =>
    rows.map(({ t, i }) => <Row key={`${t.id}-${i}`} track={t} onPlay={() => jumpTo(i)} onRemove={() => removeFromQueue(i)} />);

  return (
    <div className="px-4 pt-6 md:px-8 md:pt-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-label text-dim">{upcoming.length} up next</p>
          <h1 className="t-wide mt-2 text-4xl md:text-6xl">Queue</h1>
        </div>
        <button
          aria-pressed={autoplay}
          onClick={() => useTaste.getState().setAutoplay(!autoplay)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${autoplay ? "border-amber/60 text-amber" : "border-line text-dust"}`}
        >
          <Radio className="size-4" /> Autoplay {autoplay ? "on" : "off"}
        </button>
      </div>

      {!current ? (
        <div className="py-16 text-center">
          <p className="t-head text-2xl">Your queue is empty</p>
          <Link to="/" className="mt-5 inline-block rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-glass hover:bg-white">
            Go home
          </Link>
        </div>
      ) : (
        <>
          <p className="t-label mb-2 px-3 text-ember">Now playing</p>
          <Row track={current} active onPlay={togglePlay} />

          {queued.length > 0 && (
            <>
              <p className="t-label mb-2 mt-10 px-3 text-dim">Next up</p>
              {renderRows(queued)}
            </>
          )}

          {fromRadio.length > 0 && (
            <>
              <p className="t-label mb-2 mt-10 flex items-center gap-2 px-3 text-amber">
                <Radio className="size-3.5" /> Autoplay
              </p>
              {renderRows(fromRadio)}
            </>
          )}
        </>
      )}
    </div>
  );
}
