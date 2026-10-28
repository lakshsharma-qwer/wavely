import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { createApi } from "./api.js";
import { config } from "./config.js";
import { BeatsyncProvider } from "./providers/beatsync.js";
import { BeatsyncRoomProvider } from "./providers/beatsyncRoom.js";
import { DemoProvider } from "./providers/demo.js";
import { createMusic } from "./music.js";
import { Catalog } from "./recs/catalog.js";
import { CoPlay } from "./recs/coplay.js";
import { RecEngine } from "./recs/engine.js";
import { securityHeaders } from "./security.js";
import type { MusicProvider } from "./types.js";

const provider: MusicProvider = config.demoMode
  ? new DemoProvider()
  : config.providerUrl
    ? new BeatsyncProvider(config.providerUrl, config.providerApiKey)
    : new BeatsyncRoomProvider(config.beatsyncWsUrl, config.beatsyncConnections, config.streamHosts);
// The demo's sample audio lives on its own host.
const streamHosts = config.demoMode ? ["www.soundhelix.com"] : config.streamHosts;

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
if (config.trustProxy) app.set("trust proxy", Number(config.trustProxy) || config.trustProxy);

const catalog = new Catalog();
const coplay = new CoPlay();
const music = createMusic(provider, catalog);
const engine = new RecEngine(music, catalog, coplay, config.seedGroups);

app.use("/api", createApi(music, engine, coplay, streamHosts));

// In production the server also hosts the built frontend (single deployable).
const webDist = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : path.resolve(import.meta.dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: "1h" }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const onListening = () => {
  console.log(`Wavely API on http://localhost:${config.port} (music provider: ${provider.name})`);
  // Warm the cold-start stations so the first visitor doesn't wait.
  engine.starters().catch((err) => console.error("[recs] warm-up failed", err));
  if (provider.name === "demo") {
    console.log("DEMO_MODE is on: serving sample tracks instead of Beatsync.");
  }
};
if (config.host) app.listen(config.port, config.host, onListening);
else app.listen(config.port, onListening);
