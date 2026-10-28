# Wavely platform flowcharts

How Wavely fits together, from the screen down to the music source. The diagrams are
[Mermaid](https://mermaid.js.org): they render on GitHub and in VS Code's Markdown preview
(with a Mermaid extension). To view them in a browser, open `flowchart.html` in this folder.

## 1. System overview

One Node.js server (Express) provides the API and serves the built web app. The same
server runs in three places: on a computer or host, on a Mac shared to other devices, or
inside the Android app.

```mermaid
flowchart TB
    subgraph Clients["Where people listen"]
        Browser["Desktop browser"]
        iPhone["iPhone Safari<br/>(via Mac on hotspot / Wi-Fi)"]
        subgraph Android["Android app (Wavely.apk)"]
            Loader["Startup screen<br/>waits for the server"]
            WebView["WebView showing the web app"]
            NodeMobile["Embedded Node.js 18<br/>(capacitor-nodejs)"]
            Loader -->|"server answers /api/health"| WebView
        end
    end

    subgraph Web["Web app (React + Vite, web/src)"]
        Pages["Pages: Home, Search, Album,<br/>Artist, Library, Liked, Playlist, Queue"]
        Stores["Stores: player, library, taste<br/>(saved in localStorage)"]
        Audio["AudioEngine<br/>(HTML audio element)"]
        Pages <--> Stores
        Stores --> Audio
    end

    subgraph Server["Wavely server (Express, server/src)"]
        Security["Security headers + rate limits"]
        API["/api routes"]
        Static["Static hosting of the built web app"]
        Music["Music layer<br/>(search cache, 10 min)"]
        Recs["Recommendation engine"]
        Catalog[("Catalog graph<br/>catalog.json")]
        CoPlay[("Co-listening graph<br/>coplay.json")]
        Security --> API
        API --> Music
        API --> Recs
        Recs --> Music
        Music -->|"every result is ingested"| Catalog
        Recs --> Catalog
        Recs --> CoPlay
    end

    subgraph Providers["Music providers (pick one)"]
        Room["Beatsync room WebSocket<br/>(default)"]
        Direct["Beatsync provider API<br/>(PROVIDER_URL)"]
        Demo["Demo catalog<br/>(DEMO_MODE)"]
    end

    Uploads[("Audio files<br/>uploads.beatsync.gg")]

    Browser --> Web
    iPhone --> Web
    WebView --> Web
    NodeMobile -->|"runs on 127.0.0.1:4000"| Server
    Web -->|"HTTP /api/*"| Security
    Static -.->|"serves"| Web
    Music --> Room
    Music --> Direct
    Music --> Demo
    API -->|"proxies audio, allowlisted hosts only"| Uploads
```

## 2. Search and play a song

```mermaid
sequenceDiagram
    actor User
    participant UI as Web app
    participant API as Wavely server
    participant Cache as Search cache + catalog
    participant BS as Beatsync (WebSocket room)
    participant Host as uploads.beatsync.gg

    User->>UI: Types "arijit singh"
    UI->>API: GET /api/search?q=arijit singh
    API->>Cache: Cached result?
    alt Not cached
        Cache->>BS: SEARCH_MUSIC
        BS-->>Cache: SEARCH_RESPONSE (tracks)
        Cache->>Cache: Add tracks to the catalog graph
    end
    Cache-->>API: Tracks
    API-->>UI: Results (top result + songs)

    User->>UI: Taps play
    UI->>API: GET /api/tracks/:id/stream
    API->>BS: STREAM_MUSIC (resolve the audio URL)
    BS-->>API: SET_AUDIO_SOURCES (signed URL)
    API->>API: Check the URL host is on STREAM_HOSTS
    API->>Host: Fetch audio (forwards Range header)
    Host-->>API: Audio bytes
    API-->>UI: Streams audio/mpeg
    UI->>UI: Audio element plays

    Note over UI,API: While a song plays, the UI calls<br/>POST /api/tracks/:next/prepare so the next song starts instantly.
    Note over API,Host: If a cached URL has expired (401/403/404/410),<br/>the server resolves a fresh one once and retries.
```

## 3. Recommendations and taste

```mermaid
flowchart LR
    Listen["User listens, skips, likes"] --> Taste["Taste store<br/>(on the device)"]
    Taste -->|"builds"| Profile["Taste profile"]
    Taste -->|"POST /api/events"| Events["Listening events"]
    Events --> CoPlay[("Co-listening graph")]

    Profile -->|"POST /api/recs/home"| Home["Home stations<br/>(tuning dial)"]
    Profile -->|"POST /api/recs/radio"| Radio["Radio queue<br/>(endless play)"]
    ArtistPage["Artist page"] -->|"GET /api/recs/artist/:id/related"| Related["Related artists"]

    subgraph Engine["Recommendation engine"]
        Seeds["Starter stations<br/>(REC_SEED_GROUPS)<br/>for new listeners"]
        Expand["Expand artists by searching<br/>(grows the catalog)"]
        Score["Score tracks: blend familiar<br/>and discovery by the dial setting<br/>(Familiar / Balanced / Uncharted)"]
    end

    Home --> Engine
    Radio --> Engine
    Related --> Engine
    Engine --> Catalog[("Catalog graph")]
    Engine --> CoPlay
    Catalog -.->|"saved every 30 s"| Disk[("data/*.json")]
    CoPlay -.->|"saved every 30 s"| Disk
```

## 4. Android app startup

```mermaid
flowchart TD
    Open["User opens Wavely"] --> Activity["MainActivity (Capacitor)"]
    Activity --> ShowLoader["Show startup screen<br/>(http://localhost/index.html)"]
    Activity --> StartNode["Start embedded Node.js"]
    StartNode --> Main["nodejs/index.js"]
    Main --> Seed["Copy seed graphs to app storage<br/>(first run only)"]
    Seed --> Polyfill["Add WebSocket + normalize()<br/>(Node 18 without ICU)"]
    Polyfill --> Load{"server.js loads?"}
    Load -->|"yes"| Listen["Server listens on 127.0.0.1:4000"]
    Load -->|"no"| ErrorPage["Serve an error page<br/>on 127.0.0.1:4000"]
    ShowLoader --> Poll{"/api/health answers?"}
    Poll -->|"not yet, retry every 300 ms"| Poll
    Listen --> Poll
    ErrorPage --> Poll
    Poll -->|"yes"| Navigate["Open http://127.0.0.1:4000/"]
    Navigate --> App["Wavely web app<br/>(or the error page)"]
```
