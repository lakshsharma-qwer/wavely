import { useEffect, useRef } from "react";
import { readLevel } from "../lib/meter";
import { usePlayer } from "../store/player";

/** LED level meter driven by the real audio signal. */
export function Meter({ segments = 14, tone = "silver", className = "" }: { segments?: number; tone?: "silver" | "dark"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isPlaying = usePlayer((s) => s.isPlaying);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const leds = [...el.children] as HTMLElement[];
    let level = 0;
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const target = isPlaying ? readLevel() : 0;
      // Fast attack, slow release, like a real VU needle.
      level = target > level ? target : level * 0.9 + target * 0.1;
      const lit = Math.round(level * segments);
      leds.forEach((led, i) => led.toggleAttribute("data-on", i < lit));
      if (isPlaying || level > 0.01) frame = requestAnimationFrame(draw);
    };
    if (!reduce) frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, segments]);

  const off = tone === "silver" ? "bg-silver-ink/15" : "bg-paper/10";
  return (
    <div ref={ref} className={`flex h-3 items-stretch gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`w-[5px] rounded-[1px] ${off} transition-colors duration-75 ${
            i >= segments - 3
              ? "data-[on]:bg-ember data-[on]:shadow-[0_0_6px_rgb(255_91_58/0.8)]"
              : "data-[on]:bg-amber data-[on]:shadow-[0_0_6px_rgb(255_181_71/0.8)]"
          }`}
        />
      ))}
    </div>
  );
}
