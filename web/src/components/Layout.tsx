import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useApi } from "../lib/api";
import { useCurrentTrack, usePlayer } from "../store/player";
import { useToast } from "../store/toast";
import { AudioEngine } from "./AudioEngine";
import { MiniPlayer, PlayerBar } from "./PlayerBar";
import { NAV, Sidebar } from "./Sidebar";
import { Attribution } from "./ui";

function Toast() {
  const { message, key, clear } = useToast();
  const playerError = usePlayer((s) => s.error);
  const text = message ?? playerError;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2500);
    return () => clearTimeout(t);
  }, [message, key, clear]);

  useEffect(() => {
    if (!playerError) return;
    const t = setTimeout(() => usePlayer.getState().setError(null), 4000);
    return () => clearTimeout(t);
  }, [playerError]);

  if (!text) return null;
  return (
    <div role="status" key={key} className="pointer-events-none fixed inset-x-0 bottom-40 z-50 flex justify-center px-4 md:bottom-28">
      <div className="glass rise flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm text-paper">
        <span className={`size-1.5 rounded-full ${playerError && !message ? "bg-ember" : "bg-amber"}`} />
        {text}
      </div>
    </div>
  );
}

function MobileNav() {
  return (
    <nav aria-label="Main" className="flex border-t border-line/60 bg-base pb-[env(safe-area-inset-bottom)] md:hidden">
      {NAV.filter((n) => n.to !== "/liked").map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={"end" in rest}
          className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 ${isActive ? "text-amber" : "text-dim"}`}
        >
          <Icon className="size-[22px]" />
          <span className="t-label text-[8.5px]">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function DemoBanner() {
  const { data } = useApi<{ provider: string }>("/api/health");
  if (data?.provider !== "demo") return null;
  return (
    <div role="note" className="t-label bg-amber px-4 py-2 text-center text-glass md:rounded-xl">
      Demo mode: only sample tracks are available. Remove DEMO_MODE from server/.env to use Beatsync.
    </div>
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true], button, a, [role=slider]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        usePlayer.getState().togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const track = useCurrentTrack();
  useGlobalShortcuts();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col gap-2 md:p-2">
      <DemoBanner />
      <div className="flex min-h-0 flex-1 md:gap-1">
        <Sidebar />
        <main
          ref={mainRef}
          className="scroll-area relative isolate min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-panel md:rounded-2xl md:border md:border-line/50"
        >
          {/* The current album lights the room, faintly. */}
          {track && (
            <img
              key={track.album.id}
              src={track.album.coverSmall}
              alt=""
              aria-hidden
              className="rise pointer-events-none absolute -top-24 left-1/2 -z-10 h-[420px] w-[120%] -translate-x-1/2 object-cover opacity-30 blur-[90px] brightness-[0.4] saturate-150"
            />
          )}
          <Outlet />
          <footer className="px-4 pb-8 pt-4 md:px-8">
            <Attribution />
          </footer>
        </main>
      </div>
      <div className="flex flex-col gap-1.5 md:block">
        <MiniPlayer />
        <PlayerBar />
        <MobileNav />
      </div>
      <AudioEngine />
      <Toast />
    </div>
  );
}
