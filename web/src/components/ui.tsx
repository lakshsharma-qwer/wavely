import { Disc3, Pause, Play } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

export function Cover({ src, alt, className = "", round = false }: { src?: string; alt: string; className?: string; round?: boolean }) {
  const [failed, setFailed] = useState(false);
  const shape = round ? "rounded-full" : "rounded-[6px]";
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-raised text-dim ${shape} ${className}`} aria-label={alt}>
        <Disc3 className="size-1/3" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`bg-raised object-cover ${shape} ${className}`}
    />
  );
}

/** Amber disc: the one primary action on any surface. */
export function PlayButton({
  playing,
  onClick,
  size = "md",
  className = "",
  label,
}: {
  playing: boolean;
  onClick: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}) {
  const sizes = { sm: "size-10", md: "size-12", lg: "size-16" };
  const Icon = playing ? Pause : Play;
  return (
    <button
      type="button"
      aria-label={label ?? (playing ? "Pause" : "Play")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-amber text-glass shadow-[0_0_0_1px_rgb(0_0_0/0.3),0_8px_24px_-6px_rgb(255_150_40/0.55)] transition hover:scale-105 hover:bg-[#ffc46b] active:scale-95 ${sizes[size]} ${className}`}
    >
      <Icon className={`size-[42%] ${playing ? "" : "translate-x-[6%]"}`} fill="currentColor" strokeWidth={0} />
    </button>
  );
}

export function Btn({
  tone = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ghost" | "solid" | "amber" }) {
  const tones = {
    ghost: "border border-line text-paper hover:border-dust",
    solid: "bg-paper text-glass hover:bg-white",
    amber: "bg-amber text-glass hover:bg-[#ffc46b]",
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 ${tones[tone]} ${className}`}
    />
  );
}

/** Range slider that reports live drags and commits on release. */
export function Slider({
  value,
  max,
  onCommit,
  onPreview,
  label,
  tone = "dark",
  className = "",
}: {
  value: number;
  max: number;
  onCommit: (value: number) => void;
  onPreview?: (value: number | null) => void;
  label: string;
  tone?: "dark" | "silver";
  className?: string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  const pct = max > 0 ? Math.min(100, (shown / max) * 100) : 0;

  useEffect(() => {
    onPreview?.(drag);
  }, [drag]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    if (drag !== null) onCommit(drag);
    setDrag(null);
  };

  return (
    <input
      type="range"
      aria-label={label}
      min={0}
      max={max || 1}
      step="any"
      value={shown}
      onChange={(e) => setDrag(Number(e.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className={`slider ${tone === "silver" ? "on-silver" : ""} ${className}`}
      style={{ "--fill": `${pct}%` } as CSSProperties}
    />
  );
}

export function Eq({ paused = false }: { paused?: boolean }) {
  return (
    <span className={`eq inline-flex items-end ${paused ? "paused" : ""}`} aria-label="Now playing">
      <span />
      <span />
      <span />
    </span>
  );
}

export function ExplicitBadge() {
  return (
    <span className="t-label mr-1.5 inline-flex h-[15px] shrink-0 items-center rounded-[3px] border border-dust/60 px-[3px] text-[8.5px] leading-none text-dust" title="Explicit">
      E
    </span>
  );
}

export function Section({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-12 ${className}`}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="t-label mb-1.5 text-dim">{eyebrow}</p>}
          <h2 className="t-head truncate text-xl md:text-2xl">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="max-w-sm text-dust">{message}</p>
      {onRetry && (
        <Btn tone="solid" onClick={onRetry}>
          Try again
        </Btn>
      )}
    </div>
  );
}

export function Attribution({ className = "" }: { className?: string }) {
  return (
    <p className={`t-label text-[9.5px] text-dim ${className}`}>
      Music powered by{" "}
      <a href="https://www.beatsync.gg" target="_blank" rel="noreferrer" className="text-dust underline-offset-2 hover:text-amber hover:underline">
        Beatsync
      </a>
    </p>
  );
}
