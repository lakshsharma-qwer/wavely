import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtistCard, CardRow, CardSkeletons, TrackCard } from "../components/Cards";
import { Dial } from "../components/Dial";
import { TrackList } from "../components/TrackList";
import { Btn, Cover, ErrorState, PlayButton, Section } from "../components/ui";
import { postJson } from "../lib/api";
import { formatTotal, greeting } from "../lib/format";
import type { HomeRecs, Station } from "../lib/types";
import { useLibrary } from "../store/library";
import { useCurrentTrack, usePlayer } from "../store/player";
import { ADVENTURE_LEVELS, buildProfile, useTaste } from "../store/taste";

const CACHE_KEY = "wavely-home";

const KIND_LABEL: Record<Station["kind"], string> = {
  rotation: "Your rotation",
  mix: "Daily mix",
  genre: "Genre radio",
  deep: "Deep cuts",
  fresh: "New releases",
  uncharted: "Discovery",
  starter: "Starting point",
};

function readCache(): HomeRecs | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Home recommendations: shows the last result instantly, then refreshes in the background. */
function useHomeRecs() {
  const adventure = useTaste((s) => s.adventure);
  const [data, setData] = useState<HomeRecs | null>(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      postJson<HomeRecs>("/api/recs/home", { profile: buildProfile() }, controller.signal)
        .then((d) => {
          setData(d);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(d));
          } catch {
            // Storage full or blocked: the page still works without the cache.
          }
        })
        .catch((e: Error) => !controller.signal.aborted && setError(e.message))
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, nonce === 0 ? 0 : 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [adventure, nonce]);

  return { data, loading, error, refresh: () => setNonce((n) => n + 1) };
}

function DiscoveryControl() {
  const adventure = useTaste((s) => s.adventure);
  const set = useTaste((s) => s.setAdventure);
  return (
    <div role="radiogroup" aria-label="Discovery" className="flex items-center gap-1 rounded-full border border-line p-1">
      {ADVENTURE_LEVELS.map((l) => {
        const on = Math.abs(l.value - adventure) < 0.01;
        return (
          <button
            key={l.label}
            role="radio"
            aria-checked={on}
            onClick={() => set(l.value)}
            className={`t-label rounded-full px-3 py-1.5 text-[9.5px] transition ${on ? "bg-amber text-glass" : "text-dust hover:text-paper"}`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

function StationPanel({ station }: { station: Station }) {
  const [expanded, setExpanded] = useState(false);
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const onThisStation = !!current && station.tracks.some((t) => t.id === current.id);
  const total = station.tracks.reduce((sum, t) => sum + t.duration, 0);
  const artists = useMemo(() => {
    const seen = new Map<string, { name: string; image: string }>();
    for (const t of station.tracks) if (!seen.has(t.artist.id)) seen.set(t.artist.id, { name: t.artist.name, image: t.album.coverSmall });
    return [...seen.values()];
  }, [station]);
  const shown = expanded ? station.tracks : station.tracks.slice(0, 8);

  return (
    <div className="tune-in mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <TrackList tracks={shown} playList={station.tracks} />
        {station.tracks.length > 8 && (
          <button onClick={() => setExpanded(!expanded)} className="t-label mt-3 px-3 text-dust hover:text-amber">
            {expanded ? "Show less" : `Show all ${station.tracks.length} songs`}
          </button>
        )}
      </div>

      <aside className="order-first lg:order-none">
        <div className="flex items-center gap-4 rounded-2xl border border-line/70 bg-base/40 p-4 lg:block lg:p-5">
          <div className="min-w-0 flex-1">
            <p className="t-label text-amber">{KIND_LABEL[station.kind]}</p>
            <p className="t-label mt-2 text-dim lg:mt-4">
              {station.tracks.length} songs · {formatTotal(total)}
            </p>
            <div className="mt-4 hidden -space-x-2 lg:flex">
              {artists.slice(0, 7).map((a) => (
                <Cover key={a.name} src={a.image} alt={a.name} round className="size-8 ring-2 ring-panel" />
              ))}
            </div>
            <p className="mt-2 hidden line-clamp-2 text-sm text-dust lg:block">{artists.map((a) => a.name).slice(0, 5).join(", ")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 lg:mt-5">
            <PlayButton
              size="md"
              label={onThisStation && isPlaying ? "Pause station" : "Play station"}
              playing={onThisStation && isPlaying}
              onClick={() => (onThisStation ? usePlayer.getState().togglePlay() : usePlayer.getState().playTracks(station.tracks, 0))}
            />
            <span className="t-label hidden text-dust lg:inline">{onThisStation && isPlaying ? "Playing" : "Play"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Onboarding({ data, onDone }: { data: HomeRecs; onDone: () => void }) {
  const picks = useTaste((s) => s.picks);
  const toggle = useTaste((s) => s.togglePick);
  if (!data.starters.length) return null;
  return (
    <Section
      title="Pick a few artists you like"
      action={
        <Btn tone="amber" disabled={!picks.length} onClick={onDone}>
          Done
        </Btn>
      }
    >
      <CardRow>
        {data.starters.map((a) => (
          <ArtistCard key={a.id} artist={a} selected={picks.some((p) => p.id === a.id)} onClick={() => toggle(a)} />
        ))}
      </CardRow>
    </Section>
  );
}

function OnAirClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="t-label text-dim">
      <span className="text-dust">{now.toLocaleDateString(undefined, { weekday: "long" })}</span> ·{" "}
      {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </p>
  );
}

export default function Home() {
  const { data, loading, error, refresh } = useHomeRecs();
  const recent = useLibrary((s) => s.recent);
  const [activeId, setActiveId] = useState<string | null>(null);
  const stationsKey = data?.stations.map((s) => s.id).join();
  const firstLoad = useRef(true);

  // Land on the first station, or keep the current one if it still exists after a refresh.
  useEffect(() => {
    if (!data?.stations.length) return;
    if (firstLoad.current || !data.stations.some((s) => s.id === activeId)) setActiveId(data.stations[0].id);
    firstLoad.current = false;
  }, [stationsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = data?.stations.find((s) => s.id === activeId) ?? data?.stations[0];

  return (
    <div className="px-4 pb-6 pt-6 md:px-8 md:pt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <OnAirClock />
          <h1 className="t-wide mt-2 text-4xl md:text-6xl">{greeting()}</h1>
        </div>
        <div className="flex items-center gap-2">
          <DiscoveryControl />
          <button
            aria-label="Retune recommendations"
            title="Retune"
            onClick={refresh}
            className="rounded-full border border-line p-2.5 text-dust transition hover:border-dust hover:text-paper"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {data?.stations.length ? (
        <>
          <Dial stations={data.stations} activeId={active?.id ?? null} onTune={setActiveId} />
          {active && <StationPanel key={active.id} station={active} />}
        </>
      ) : loading ? (
        <div className="glass flex h-[188px] items-center justify-center rounded-2xl">
          <p className="t-label glow-text animate-pulse">Loading…</p>
        </div>
      ) : (
        error && <ErrorState message="Couldn't reach the stations. Check your connection, then retune." onRetry={refresh} />
      )}

      <div className="mt-14">
        {data && !data.personalized && <Onboarding data={data} onDone={refresh} />}

        {data?.rows.map((row) => (
          <Section key={row.title} title={row.title}>
            <CardRow>
              {row.tracks.map((t, i) => (
                <TrackCard key={t.id} track={t} list={row.tracks} index={i} />
              ))}
            </CardRow>
          </Section>
        ))}

        {data?.artists && (
          <Section title={data.artists.title}>
            <CardRow>
              {data.artists.items.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </CardRow>
          </Section>
        )}

        {recent.length > 0 && (
          <Section title="Recently played">
            <CardRow>
              {recent.slice(0, 15).map((t, i) => (
                <TrackCard key={t.id} track={t} list={recent} index={i} />
              ))}
            </CardRow>
          </Section>
        )}

        {loading && !data && (
          <Section title="">
            <CardSkeletons />
          </Section>
        )}
      </div>
    </div>
  );
}
