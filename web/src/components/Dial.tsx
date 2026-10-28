import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Station } from "../lib/types";

// The tuning dial: the engine's stations laid out along an FM band, from the
// familiar end (low frequencies) to uncharted (high). Drag the needle, click the
// band, or use the arrow keys to tune.

const MIN = 87.5;
const MAX = 108.5;
const pct = (f: number) => ((f - MIN) / (MAX - MIN)) * 100;
const MAJOR = [88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108];
const MINOR = Array.from({ length: Math.round((MAX - MIN) / 0.4) + 1 }, (_, i) => MIN + i * 0.4);

export function Dial({
  stations,
  activeId,
  onTune,
}: {
  stations: Station[];
  activeId: string | null;
  onTune: (id: string) => void;
}) {
  const bandRef = useRef<HTMLDivElement>(null);
  const [dragFreq, setDragFreq] = useState<number | null>(null);
  const activeIndex = Math.max(0, stations.findIndex((s) => s.id === activeId));
  const active = stations[activeIndex];
  const needle = dragFreq ?? active?.freq ?? 88.1;

  const freqAt = (clientX: number) => {
    const rect = bandRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return MIN + ratio * (MAX - MIN);
  };
  const nearest = (f: number) =>
    stations.reduce((best, s) => (Math.abs(s.freq - f) < Math.abs(best.freq - f) ? s : best), stations[0]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!stations.length) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragFreq(freqAt(e.clientX));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragFreq !== null) setDragFreq(freqAt(e.clientX));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragFreq === null) return;
    const s = nearest(freqAt(e.clientX));
    setDragFreq(null);
    if (s) onTune(s.id);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step || !stations.length) return;
    e.preventDefault();
    const next = stations[(activeIndex + step + stations.length) % stations.length];
    onTune(next.id);
  };

  return (
    <div className="glass relative overflow-hidden rounded-2xl px-4 pb-4 pt-5 md:px-8 md:pb-5 md:pt-6">
      {/* Station names above the band (desktop); on mobile only the active one shows below. */}
      <div className="relative mb-2 hidden h-5 md:block" aria-hidden>
        {stations.map((s) => {
          const p = pct(s.freq);
          // Anchor labels at the ends of the band inward so they never clip.
          const anchor = p < 12 ? "-translate-x-[12px]" : p > 88 ? "-translate-x-[calc(100%-12px)]" : "-translate-x-1/2";
          return (
          <button
            key={s.id}
            tabIndex={-1}
            onClick={() => onTune(s.id)}
            style={{ left: `${p}%` }}
            className={`t-label absolute top-0 max-w-[10rem] truncate text-[9.5px] transition-colors ${anchor} ${s.id === active?.id ? "glow-text" : "text-dim hover:text-dust"}`}
          >
            {s.name}
          </button>
          );
        })}
      </div>

      <div
        ref={bandRef}
        role="slider"
        tabIndex={0}
        aria-label="Tune to a station"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={active?.freq ?? MIN}
        aria-valuetext={active ? `${active.freq} FM, ${active.name}` : "No stations"}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDragFreq(null)}
        className="relative h-14 cursor-ew-resize touch-none select-none rounded-md md:h-16"
      >
        {/* Minor ticks */}
        {MINOR.map((f) => (
          <span key={f} className="absolute bottom-5 h-2 w-px bg-dim/40" style={{ left: `${pct(f)}%` }} />
        ))}
        {/* Major ticks and numbers */}
        {MAJOR.map((f) => (
          <span key={f} className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: `${pct(f)}%` }}>
            <span className="h-4 w-px bg-dust/60" />
            <span className="t-num text-[9px] text-dim md:text-[10px]">{f}</span>
          </span>
        ))}
        {/* Station markers */}
        {stations.map((s) => (
          <span
            key={s.id}
            className={`absolute top-3 size-1.5 -translate-x-1/2 rounded-full transition-colors ${s.id === active?.id ? "bg-amber shadow-[0_0_10px_rgb(255_181_71)]" : "bg-dust/50"}`}
            style={{ left: `${pct(s.freq)}%` }}
          />
        ))}
        {/* Needle */}
        <span
          className={`needle pointer-events-none absolute -top-1 bottom-4 w-[3px] -translate-x-1/2 rounded-full ${dragFreq === null ? "transition-[left] duration-700 ease-[cubic-bezier(0.3,1.25,0.4,1)]" : ""}`}
          style={{ left: `${pct(needle)}%` }}
        />
      </div>

      {active && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/5 pt-4">
          <span className="t-num glow-text text-3xl font-semibold md:text-4xl" aria-hidden>
            {(dragFreq ?? active.freq).toFixed(1)}
          </span>
          <span className="t-label text-dim">FM</span>
          <h2 key={active.id} className="t-display tune-in min-w-0 flex-1 basis-full truncate text-2xl md:basis-auto md:text-4xl">
            {active.name}
          </h2>
        </div>
      )}
    </div>
  );
}
