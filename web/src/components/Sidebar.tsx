import { Disc3, Heart, ListMusic, Radio, Search } from "lucide-react";
import { NavLink } from "react-router";

export const NAV = [
  { to: "/", label: "Home", icon: Radio, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/library", label: "Library", icon: Disc3 },
  { to: "/liked", label: "Liked", icon: Heart },
  { to: "/queue", label: "Queue", icon: ListMusic },
] as const;

export function Logo({ className = "" }: { className?: string }) {
  return <img src="/favicon.svg" alt="Wavely" className={`rounded-[10px] ${className}`} />;
}

/** Slim rail of the app's sections, like the selector knob on a receiver. */
export function Sidebar() {
  return (
    <nav aria-label="Main" className="hidden w-[84px] shrink-0 flex-col items-center gap-1 py-3 md:flex">
      <NavLink to="/" aria-label="Wavely home" className="mb-5">
        <Logo className="size-11" />
      </NavLink>
      {NAV.map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={"end" in rest}
          className={({ isActive }) =>
            `group relative flex w-full flex-col items-center gap-1.5 py-3 transition-colors ${isActive ? "text-amber" : "text-dim hover:text-paper"}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition ${isActive ? "needle" : "bg-transparent"}`} />
              <Icon className="size-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="t-label text-[9px]">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
