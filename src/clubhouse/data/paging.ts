import 'server-only';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import type { RlsCaptureCtx } from '@/lib/supabase/fetch-all-rows';

type Page<T> = { data: T[] | null; error: { message: string; code?: string | null } | null; count?: number | null };

/** Most pages asked for together; more than this and the read goes in more than one batch. */
export const PAGES_TOGETHER = 8;

/**
 * `fetchAllRowsResult` (every row of a query past PostgREST's 1,000-row cap, `{ data, error }`), asking for the pages together instead of
 * one at a time. Its pages are read one after another, so a team's putts (a few thousand rows) were a round trip per thousand.
 *
 * The first page is read as before, and asks for the row count with it (`count: 'exact'`, which PostgREST answers beside the page): when the
 * first page is full and the count says how many more there are, every remaining page is asked for at once (in batches of `together`), so a
 * read of any size is two round trips and no page is asked for that is not there. If the count does not come back (a source that does not
 * answer one), a full first page is followed by batches of `together` pages until one comes back short, which can ask for pages past the end.
 * Same contract as before: the caller builds the query with a stable order on a unique column, the first failing page ends the read with
 * its error, and `data` is null when the first page failed.
 *
 * `makeQuery(from, to, count)`: `count` is `'exact'` on the first page and undefined after it; pass it to `.select(cols, { count })`.
 */
export async function fetchAllRowsTogether<T>(
  makeQuery: (from: number, to: number, count: 'exact' | undefined) => PromiseLike<Page<T>>,
  pageSize = 1000,
  rlsCtx?: RlsCaptureCtx,
  together = PAGES_TOGETHER,
): Promise<Page<T>> {
  const all: T[] = [];
  const fail = (error: NonNullable<Page<T>['error']>, first: boolean): Page<T> => {
    maybeCaptureRlsDenial(error, { table: rlsCtx?.table ?? 'unknown', verb: rlsCtx?.verb ?? 'select', action: rlsCtx?.action ?? 'fetchAllRowsTogether', userId: rlsCtx?.userId, sport: rlsCtx?.sport, feature: rlsCtx?.feature });
    return { data: first ? null : all, error };
  };
  const head = await makeQuery(0, pageSize - 1, 'exact');
  if (head.error) return fail(head.error, true);
  all.push(...(head.data ?? []));
  if ((head.data ?? []).length < pageSize) return { data: all, error: null };
  // The count says this page was all of it (a read that is exactly one page long).
  if (typeof head.count === 'number' && head.count <= all.length) return { data: all, error: null };

  // A bound, as the sequential version has: a million rows is far beyond any stats read.
  const maxPages = 1000;
  const known = typeof head.count === 'number' && head.count > pageSize ? Math.min(maxPages, Math.ceil(head.count / pageSize)) : null;
  for (let page = 1; page < maxPages; ) {
    const batchSize = known === null ? together : Math.min(together, known - page);
    if (batchSize <= 0) break;
    const batch = await Promise.all(Array.from({ length: batchSize }, (_, i) => makeQuery((page + i) * pageSize, (page + i + 1) * pageSize - 1, undefined)));
    for (const result of batch) {
      if (result.error) return fail(result.error, false);
      all.push(...(result.data ?? []));
      if ((result.data ?? []).length < pageSize) return { data: all, error: null };
    }
    page += batchSize;
  }
  return { data: all, error: null };
}
