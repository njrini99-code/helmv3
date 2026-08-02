/**
 * Split an id list into URL-safe slices for PostgREST `.in()` filters.
 *
 * A single `.in('id', ids)` serialises every id into the query string. Past
 * ~200 UUIDs the URL exceeds what PostgREST/the proxy will accept, and the
 * request fails with a 400 BEFORE Postgres sees it — which call sites that
 * do `data ?? []` render as "no rows" rather than as an error. 200 is the
 * size already proven in production by ID_CHUNK_SIZE in
 * src/lib/admin/auto-resolve.ts and src/app/api/cron/event-reminders/route.ts.
 *
 * Orthogonal to fetch-all-rows.ts: this bounds the REQUEST url, that bounds
 * the RESPONSE row count. A large `.in()` over a large table needs BOTH —
 * chunk the ids, then page each chunk.
 */
export const ID_CHUNK_SIZE = 200;

export function chunkIds<T>(items: readonly T[], size: number = ID_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error('chunkIds: size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
