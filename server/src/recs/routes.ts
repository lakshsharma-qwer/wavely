import express, { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { rateLimit } from "../security.js";
import type { Catalog } from "./catalog.js";
import type { CoPlay } from "./coplay.js";
import { ProfileSchema, TrackSchema, type RecEngine } from "./engine.js";

const EventsSchema = z.object({
  deviceId: z.string().regex(/^[\w-]{8,64}$/),
  events: z
    .array(
      z.object({
        trackId: z.string().regex(/^\d{1,20}$/),
        artistId: z.string().max(40),
        type: z.enum(["play", "complete", "skip", "like"]),
        ts: z.number(),
      }),
    )
    .max(50),
});

const RadioSchema = z.object({
  seed: TrackSchema,
  profile: ProfileSchema.optional(),
  exclude: z.array(z.string().max(40)).max(500).default([]),
});

export function createRecsRouter(engine: RecEngine, coplay: CoPlay, catalog: Catalog) {
  const router = Router();
  const recsLimit = rateLimit(config.recsPerMinute);
  // The app sends events every 15 seconds; this leaves room for retries only.
  const eventsLimit = rateLimit(12);
  router.use(["/recs", "/events"], express.json({ limit: "300kb" }));
  router.use("/recs", recsLimit);

  router.post("/recs/home", async (req, res) => {
    const parsed = ProfileSchema.safeParse(req.body?.profile ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid taste profile" });
    res.json(await engine.home(parsed.data));
  });

  router.post("/recs/radio", async (req, res) => {
    const parsed = RadioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid radio request" });
    const { seed, profile, exclude } = parsed.data;
    res.json({ tracks: await engine.radio(seed, profile, exclude) });
  });

  router.get("/recs/artist/:id/related", async (req, res) => {
    res.json({ artists: await engine.relatedArtists(req.params.id) });
  });

  router.post("/events", eventsLimit, (req, res) => {
    const parsed = EventsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid events" });
    // Ignore clock skew beyond a day so stale or forged timestamps can't distort sessions.
    const now = Date.now();
    // Only real songs count, attributed to their real artist, so the shared graph can't be fed fakes.
    const events = parsed.data.events.filter(
      (e) => Math.abs(now - e.ts) < 24 * 60 * 60_000 && catalog.tracks.get(e.trackId)?.artist.id === e.artistId,
    );
    coplay.record(parsed.data.deviceId, events);
    engine.warm(events.filter((e) => e.type !== "skip").map((e) => e.artistId));
    res.status(204).end();
  });

  return router;
}
