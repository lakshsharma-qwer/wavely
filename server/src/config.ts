import "dotenv/config";

function parseHomeSections(raw: string) {
  return raw
    .split("|")
    .map((entry) => {
      const [title, query] = entry.split(":").map((s) => s.trim());
      return title && query ? { title, query } : null;
    })
    .filter((s): s is { title: string; query: string } => s !== null);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** Interface to listen on; unset listens on all of them. */
  host: process.env.HOST?.trim() || undefined,
  /** Beatsync's public WebSocket; used unless PROVIDER_URL or DEMO_MODE is set. */
  beatsyncWsUrl: process.env.BEATSYNC_WS_URL?.trim() || "wss://server.beatsync.gg/ws",
  /** Parallel room connections to Beatsync (each runs one search at a time). */
  beatsyncConnections: Number(process.env.BEATSYNC_CONNECTIONS ?? 3),
  /** Serve the built-in sample tracks instead of Beatsync (offline development). */
  demoMode: process.env.DEMO_MODE === "true",
  /** Optional direct Beatsync provider API (/api/search, /api/track), if Beatsync issues one. */
  providerUrl: process.env.PROVIDER_URL?.trim() || undefined,
  /** Optional credential issued under the Beatsync agreement, sent as a Bearer token. */
  providerApiKey: process.env.PROVIDER_API_KEY?.trim() || undefined,
  /** "Title:search query" pairs separated by "|" that build the home page rows. */
  homeSections: parseHomeSections(
    process.env.HOME_SECTIONS ??
      "Trending now:top hits|Chill vibes:chill|Workout energy:workout|Hip-hop essentials:hip hop|Indie picks:indie|Throwbacks:90s hits",
  ),
  /** Cold-start stations: "Name:Artist, Artist|Name:Artist" until a listener has history. */
  seedGroups: (
    process.env.REC_SEED_GROUPS ??
    "Punjabi heat:Karan Aujla, Diljit Dosanjh, AP Dhillon, Shubh|Bollywood hearts:Arijit Singh, Shreya Ghoshal, Pritam|Global pop:Taylor Swift, Dua Lipa, The Weeknd|Hip-hop:Drake, Kendrick Lamar, Travis Scott|Soft & indie:Anuv Jain, Prateek Kuhad, Lauv"
  )
    .split("|")
    .map((g) => {
      const [name, list = ""] = g.split(":");
      return { name: name.trim(), artists: list.split(",").map((a) => a.trim()).filter(Boolean) };
    })
    .filter((g) => g.name && g.artists.length),
  /** Hosts audio may be streamed from. Anything else is refused, so a bad URL can't
   *  make the server fetch internal addresses. */
  streamHosts: (process.env.STREAM_HOSTS ?? "uploads.beatsync.gg")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  /** Where the recommendation graphs are saved. */
  dataDir: process.env.DATA_DIR?.trim() || undefined,
  /** New songs a single visitor can start loading per minute (each one costs Beatsync work). */
  streamResolvesPerMinute: Number(process.env.STREAM_RESOLVES_PER_MINUTE ?? 30),
  /** Recommendation requests per minute per IP (each can trigger several searches). */
  recsPerMinute: Number(process.env.RECS_PER_MINUTE ?? 30),
  /** Requests per minute per IP for metadata endpoints (streaming is exempt). */
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
  trustProxy: process.env.TRUST_PROXY,
};
