import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(import.meta.dirname, "../../data");

/** Loads a JSON snapshot, or returns null when there isn't a usable one. */
export function loadSnapshot<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Writes a snapshot atomically so a crash mid-write never corrupts it. */
export function saveSnapshot(name: string, data: unknown) {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(data));
  renameSync(`${file}.tmp`, file);
}

const flushers: (() => void)[] = [];
let shutdownHooked = false;

function hookShutdown() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const flushAll = () => flushers.forEach((f) => f());
  process.once("beforeExit", flushAll);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      flushAll();
      process.exit(0);
    });
  }
}

/** Calls `save` at most once per interval after something changed, and on shutdown. */
export function autosave(save: () => void, intervalMs = 30_000) {
  let dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    try {
      save();
    } catch (err) {
      console.error("[recs] snapshot failed", err);
    }
  };
  setInterval(flush, intervalMs).unref();
  flushers.push(flush);
  hookShutdown();
  return () => {
    dirty = true;
  };
}

/** Adds weight to an edge in a capped adjacency map, pruning the weakest when full. */
export function bump(edges: Map<string, Map<string, number>>, a: string, b: string, w: number, cap = 80) {
  if (a === b) return;
  let row = edges.get(a);
  if (!row) edges.set(a, (row = new Map()));
  row.set(b, (row.get(b) ?? 0) + w);
  if (row.size > cap) {
    let minKey = "";
    let min = Infinity;
    for (const [k, v] of row) if (v < min && k !== b) [min, minKey] = [v, k];
    row.delete(minKey);
  }
}

export type EdgePairs = [string, [string, number][]][];

export const toPairs = (edges: Map<string, Map<string, number>>): EdgePairs =>
  [...edges].map(([k, row]) => [k, [...row]]);

export const fromPairs = (pairs: EdgePairs | undefined) =>
  new Map((pairs ?? []).map(([k, row]) => [k, new Map(row)]));
