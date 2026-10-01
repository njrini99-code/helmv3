import 'server-only';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import type { RlsCaptureCtx } from '@/lib/supabase/fetch-all-rows';

type Page<T> = { data: T[] | null; error: { message: string; code?: string | null } | null };

/** Most pages asked for together. */
export const PAGES_TOGETHER = 8;

/**
 * `fetchAllRowsResult` (every row of a query past PostgREST's 1,000-row cap, `{ data, error }`), asking for the pages in batches instead of
 * one at a time. Its pages are read one after another, so a team's putts (a few thousand rows) were a round trip per thousand.
 *
 * The first page is read as before. If it comes back full, the next two pages are asked for together, then the next four, then eight at a time,
 * until a page comes back short: a read of two pages costs the same two round trips it did, three pages two instead of three, six pages three
 * instead of six. A batch can ask for pages past the end (at most its size minus one, and each is an empty page the database skips rows to
 * reach), which is why the batches start small: a count of the rows (`count: 'exact'`) would size them exactly, but it is a second scan of
 * every row on the first page, which measured slower than the sequential read for a read of two pages (the common one), and so is not asked.
 * Same contract as before: the caller builds the query with a stable order on a unique column, the first failing page ends the read with its
 * error, and `data` is null when the first page failed.
 */
export async function fetchAllRowsTogether<T>(
  makeQuery: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize = 1000,
  rlsCtx?: RlsCaptureCtx,
  together = PAGES_TOGETHER,
): Promise<Page<T>> {
  const all: T[] = [];
  const fail = (error: NonNullable<Page<T>['error']>, first: boolean): Page<T> => {
    maybeCaptureRlsDenial(error, { table: rlsCtx?.table ?? 'unknown', verb: rlsCtx?.verb ?? 'select', action: rlsCtx?.action ?? 'fetchAllRowsTogether', userId: rlsCtx?.userId, sport: rlsCtx?.sport, feature: rlsCtx?.feature });
    return { data: first ? null : all, error };
  };
  const head = await makeQuery(0, pageSize - 1);
  if (head.error) return fail(head.error, true);
  all.push(...(head.data ?? []));
  if ((head.data ?? []).length < pageSize) return { data: all, error: null };

  // A bound, as the sequential version has: a million rows is far beyond any stats read.
  let size = Math.min(2, together);
  for (let page = 1; page < 1000; page += size, size = Math.min(size * 2, together)) {
    const batch = await Promise.all(Array.from({ length: size }, (_, i) => makeQuery((page + i) * pageSize, (page + i + 1) * pageSize - 1)));
    for (const result of batch) {
      if (result.error) return fail(result.error, false);
      all.push(...(result.data ?? []));
      if ((result.data ?? []).length < pageSize) return { data: all, error: null };
    }
  }
  return { data: all, error: null };
}
