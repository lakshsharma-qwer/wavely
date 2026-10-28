import { TtlCache } from "./cache.js";
import type { Catalog } from "./recs/catalog.js";
import type { MusicProvider, SearchPage, Track } from "./types.js";

const MINUTE = 60_000;

/** Cached search shared by the API and the recommendation engine. Every page
 *  fetched is folded into the catalog, so the knowledge graph grows with use. */
export function createMusic(provider: MusicProvider, catalog: Catalog) {
  const cache = new TtlCache<SearchPage>(10 * MINUTE, 2000);

  const search = (q: string, offset = 0) =>
    cache.wrap(`${q.toLowerCase()}::${offset}`, async () => {
      const page = await provider.search(q, offset);
      catalog.ingest(page.items, q, offset);
      return page;
    });

  /** First two result pages: enough to rebuild an album or artist view from search. */
  async function searchDeep(q: string): Promise<Track[]> {
    const first = await search(q, 0);
    const nextOffset = first.offset + first.limit;
    if (first.limit <= 0 || nextOffset >= first.total) return first.items;
    const second = await search(q, nextOffset).catch(() => null);
    return [...first.items, ...(second?.items ?? [])];
  }

  return { provider, catalog, search, searchDeep };
}

export type Music = ReturnType<typeof createMusic>;
