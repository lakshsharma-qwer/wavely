# Wavely

A Spotify-style music streaming web app. No sign-up: anyone can open it and start listening.
Music is powered by [Beatsync](https://www.beatsync.gg).

## How it works

```
Browser (React)  ──>  Wavely server (Express)  ──WebSocket──>  beatsync.gg room
  search box           /api/search                SEARCH_MUSIC  → results
  click a song         /api/tracks/:id/stream     STREAM_MUSIC  → https://uploads.beatsync.gg/room-…/song.mp3
```

- **Search:** the server keeps a few connections open to a beatsync.gg room (`wss://server.beatsync.gg/ws`), sends `SEARCH_MUSIC` and returns the results. Results are cached for 10 minutes.
- **Playback:** when a song is clicked, the server sends `STREAM_MUSIC`. Beatsync loads the song into the room and broadcasts its `uploads.beatsync.gg` URL, usually in about 4 seconds. The server streams that file to the browser with Range support, so seeking works and audio is served from your own domain. URLs are cached for 6 hours and refreshed automatically if one stops working.
- **Next song:** while a song plays, the browser asks the server to prepare the next one in the queue, so skipping is near-instant.
- **Album and artist pages** are built from search results.

## Recommendation engine

Everything personal stays in the visitor's browser; the server only sees a compact taste profile with each request plus anonymous play events.

**Taste profile (browser, `web/src/store/taste.ts`).** Plays (30s or half the song), full listens, likes, playlist adds, skips and unlikes are logged with weights (like 4, add 3, complete 2, play 1, skip −2, unlike −3) and a 21-day half-life. They roll up into artist, genre and song weights, recent "seed" songs, songs on repeat, everything already heard, and artists that keep getting skipped. Picking artists on first visit seeds the profile.

**Knowledge graph (server, `server/src/recs/catalog.ts`).** Every search result is folded in, so the graph grows with use. Artists are linked by:
- featured credits parsed from titles ("feat.", "ft.", "with"), including artists not seen yet, linked once they appear;
- shared songwriters/composers;
- showing up in each other's search results;
- the hand-picked starter groups;
- a weak tie to popular artists in the same main genre.

The engine also searches `feat <artist>` to find collaborators, and looks up featured artists it hasn't seen yet.

**Listeners-like-you graph (server, `server/src/recs/coplay.ts`).** Anonymous devices post play events; songs and artists enjoyed close together in one session are linked, closer ones counting more.

**Scoring and stations (`server/src/recs/engine.ts`).** Candidates are scored on artist affinity, closeness to favourite artists, genre fit, co-listening, popularity and freshness, with penalties for already-heard songs and skipped artists. The Familiar / Balanced / Uncharted control shifts weight between the familiar and discovery terms. Results are diversified (per-artist caps, duplicate versions removed, no back-to-back artists), and every song carries a reason. The engine builds:
- **Dial stations** from familiar to new: On repeat, a mix per cluster of related favourite artists, Genre radio, Deep cuts, Fresh finds, Uncharted (two steps out on the graph);
- **Because you played…** rows, **Fans of … also play**, and **artist / song radio**;
- **Autoplay**, which keeps going with radio picks when the queue ends.

Graphs are saved to `server/data/` every 30 seconds and on shutdown.
- **Likes, playlists, recently played and the queue** are stored in the visitor's browser (localStorage). No accounts and no database.

## Run locally

```bash
npm install
npm run dev        # web on http://localhost:5173, API on :4000
```

No configuration is needed. Optional settings are in `server/.env.example`; copy it to `server/.env` to change them.
Set `DEMO_MODE=true` to use offline sample tracks instead of Beatsync.

## Deploy

```bash
npm run build
npm start          # one Node process serves the API and the built frontend on $PORT
```

Set `TRUST_PROXY=1` when the app runs behind a host's proxy.
Any Node host works (Render, Railway, Fly.io, a VPS).

## Configuration (`server/.env`)

| Variable | Purpose |
| --- | --- |
| `BEATSYNC_WS_URL` | Beatsync WebSocket (default `wss://server.beatsync.gg/ws`) |
| `BEATSYNC_CONNECTIONS` | Parallel room connections; each runs one search at a time (default 3) |
| `PROVIDER_URL` / `PROVIDER_API_KEY` | Optional direct Beatsync provider API; used instead of the WebSocket when set |
| `DEMO_MODE` | `true` to serve offline sample tracks |
| `REC_SEED_GROUPS` | Starter stations for new listeners, as `Name:Artist, Artist\|Name:Artist` |
| `HOME_SECTIONS` | Home rows as `Title:query` pairs separated by `\|` |
| `RATE_LIMIT_PER_MINUTE` | Per-IP limit on search and metadata requests (default 120) |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy so rate limiting sees real client IPs |

## Project layout

```
server/src/
  index.ts              app entry and static hosting
  api.ts                routes, caching, rate limiting, audio proxy
  providers/beatsyncRoom.ts  beatsync.gg WebSocket client (search + song URLs)
  providers/beatsync.ts      result parsing, and the optional direct provider API
  recs/                      knowledge graph, co-listening graph, recommendation engine, routes
  providers/demo.ts     offline demo catalog
web/src/
  store/                player (queue/shuffle/repeat) and library (likes/playlists) state
  components/           layout, player bar, track list, cards, menus
  pages/                Home (tuning dial), Search, Album, Artist, Crate, Liked, Playlist, Queue
  store/taste.ts        listening events and the taste profile
android-app/            Android APK that runs the whole app on the phone (see its README)
```
