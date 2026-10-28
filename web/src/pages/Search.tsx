import { Radio, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlbumCard, ArtistCard, CardRow } from "../components/Cards";
import { TrackList } from "../components/TrackList";
import { Btn, Cover, ErrorState, ExplicitBadge, PlayButton, Section } from "../components/ui";
import { artistPath, getJson, postJson } from "../lib/api";
import { year } from "../lib/format";
import type { HomeRecs, SearchPage, Track } from "../lib/types";
import { useCurrentTrack, usePlayer } from "../store/player";

const RECENT_KEY = "wavely-recent-searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const list = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Not critical.
  }
}

function unique<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)));
}

function TopResult({ track, list }: { track: Track; list: Track[] }) {
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const active = current?.id === track.id;
  const play = () => (active ? usePlayer.getState().togglePlay() : usePlayer.getState().playTracks(list, 0));
  return (
    <div className="glass relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-5">
        <Cover src={track.album.cover} alt={track.album.title} className="size-28 shrink-0 shadow-[0_18px_40px_-14px_rgb(0_0_0/0.95)] md:size-32" />
        <div className="min-w-0 pt-1">
          <p className="t-label text-amber">Top result</p>
          <p className={`t-display mt-2 line-clamp-2 text-2xl md:text-3xl ${active ? "text-amber" : ""}`}>{track.title}</p>
          <p className="mt-2 flex items-center text-dust">
            {track.explicit && <ExplicitBadge />}
            <Link to={artistPath(track.artist)} className="truncate font-semibold text-paper hover:underline">
              {track.artist.name}
            </Link>
            <span className="t-num ml-2 text-xs text-dim">{year(track.album.releaseDate)}</span>
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3">
        <PlayButton playing={active && isPlaying} onClick={play} />
        <Btn onClick={() => void usePlayer.getState().startRadio(track)}>
          <Radio className="size-4 text-amber" /> Start radio
        </Btn>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const [recent, setRecent] = useState(readRecent);
  const [starters, setStarters] = useState<HomeRecs["starters"]>([]);

  useEffect(() => {
    const controller = new AbortController();
    postJson<HomeRecs>("/api/recs/home", { profile: {} }, controller.signal)
      .then((d) => setStarters(d.starters))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <>
      {recent.length > 0 && (
        <Section
          title="Recent searches"
          action={
            <button
              onClick={() => {
                localStorage.removeItem(RECENT_KEY);
                setRecent([]);
              }}
              className="t-label text-dim hover:text-paper"
            >
              Clear
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <button key={q} onClick={() => onPick(q)} className="rounded-full border border-line px-4 py-2 text-sm text-paper hover:border-amber hover:text-amber">
                {q}
              </button>
            ))}
          </div>
        </Section>
      )}
      {starters.length > 0 && (
        <Section title="Popular artists">
          <CardRow>
            {starters.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </CardRow>
        </Section>
      )}
    </>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [input, setInput] = useState(urlQuery);
  const [results, setResults] = useState<SearchPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setInput(urlQuery);
  }, [urlQuery]);

  // Debounce typing into the URL so results are shareable and survive back/forward.
  useEffect(() => {
    const q = input.trim();
    if (q === urlQuery.trim()) return;
    const t = setTimeout(() => setParams(q ? { q } : {}, { replace: true }), 350);
    return () => clearTimeout(t);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = urlQuery.trim();
    setResults(null);
    setError(null);
    if (!q) return;
    const controller = new AbortController();
    setLoading(true);
    getJson<SearchPage>(`/api/search?q=${encodeURIComponent(q)}`, controller.signal)
      .then((page) => {
        setResults(page);
        if (page.items.length) saveRecent(q);
      })
      .catch((e: Error) => !controller.signal.aborted && setError(e.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
  }, [urlQuery]);

  const loadMore = async () => {
    if (!results) return;
    setLoadingMore(true);
    try {
      const offset = results.offset + results.limit;
      const page = await getJson<SearchPage>(`/api/search?q=${encodeURIComponent(urlQuery.trim())}&offset=${offset}`);
      setResults({ ...page, items: unique([...results.items, ...page.items], (t) => t.id) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const tracks = results?.items ?? [];
  const artists = useMemo(
    () => unique(tracks, (t) => t.artist.id).slice(0, 10).map((t) => ({ ...t.artist, image: t.album.cover, genre: t.genre })),
    [tracks],
  );
  const albums = useMemo(() => unique(tracks, (t) => t.album.id).slice(0, 10), [tracks]);
  const hasMore = !!results && results.offset + results.limit < results.total && results.offset + results.limit <= 1000;

  return (
    <div className="px-4 pb-6 md:px-8">
      <div className="sticky top-0 z-10 -mx-4 bg-panel/90 px-4 pb-4 pt-6 backdrop-blur-xl md:-mx-8 md:px-8 md:pt-8">
        <label className="glass relative flex items-center rounded-2xl transition-shadow focus-within:shadow-[inset_0_2px_12px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_181_71/0.45),0_0_28px_-6px_rgb(255_181_71/0.35)]">
          <SearchIcon className="pointer-events-none absolute left-5 size-5 text-amber" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setParams(input.trim() ? { q: input.trim() } : {}, { replace: true })}
            placeholder="Songs, artists, albums"
            aria-label="Search songs, artists and albums"
            className="t-head h-16 w-full bg-transparent pl-14 pr-14 text-xl text-paper caret-amber outline-none focus-visible:outline-none placeholder:text-dim md:h-[72px] md:text-2xl"
          />
          {input && (
            <button aria-label="Clear search" onClick={() => setInput("")} className="absolute right-4 p-1.5 text-dim hover:text-paper">
              <X className="size-5" />
            </button>
          )}
        </label>
      </div>

      <div className="mt-6">
        {!urlQuery.trim() && <EmptyState onPick={setInput} />}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton size-11 rounded-[6px]" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-1/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <ErrorState message={error} />}

        {results && tracks.length === 0 && (
          <div className="py-20 text-center">
            <p className="t-head text-2xl">Nothing found for "{urlQuery}"</p>
            <p className="mt-2 text-dust">Check the spelling, or search for an artist name instead.</p>
          </div>
        )}

        {tracks.length > 0 && (
          <>
            <div className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <TopResult track={tracks[0]} list={tracks} />
              <div className="min-w-0">
                <p className="t-label mb-2 px-3 text-dim">Songs</p>
                <TrackList tracks={tracks.slice(0, 5)} playList={tracks} variant="compact" />
              </div>
            </div>

            {artists.length > 0 && (
              <Section title="Artists">
                <CardRow>
                  {artists.map((a) => (
                    <ArtistCard key={a.id} artist={a} />
                  ))}
                </CardRow>
              </Section>
            )}

            {albums.length > 0 && (
              <Section title="Albums">
                <CardRow>
                  {albums.map((t) => (
                    <AlbumCard key={t.album.id} album={t.album} artist={t.artist} />
                  ))}
                </CardRow>
              </Section>
            )}

            <Section title="All songs">
              <TrackList tracks={tracks} />
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <Btn onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more songs"}
                  </Btn>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
