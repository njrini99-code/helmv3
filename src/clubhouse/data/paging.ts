import 'server-only';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import type { RlsCaptureCtx } from '@/lib/supabase/fetch-all-rows';

type Page<T> = { data: T[] | null; error: { message: string; code?: string | null } | null };

/** How many pages are asked for together once the first one comes back full. */
export const PAGES_TOGETHER = 4;

/**
 * `fetchAllRowsResult` (every row of a query past PostgREST's 1,000-row cap, `{ data, error }`), asking for pages together instead of one
 * at a time. Its pages are read one after another, so a team's putts (a few thousand rows) were a round trip per thousand; here the
 * first page is read as before, and if it comes back full the next `together` pages are asked for at once, then the next batch, until
 * a page comes back short. A read that fits in one page costs exactly what it did; one that does not costs a round trip per batch
 * instead of per page, and at most `together - 1` reads past the end (empty or short). Same contract: the caller builds the query with
 * a stable order on a unique column, the first failing page ends the read with its error, and `data` is null when the first page failed.
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
  for (let from = pageSize; from < pageSize * 1000; from += pageSize * together) {
    const batch = await Promise.all(Array.from({ length: together }, (_, i) => makeQuery(from + i * pageSize, from + (i + 1) * pageSize - 1)));
    for (const page of batch) {
      if (page.error) return fail(page.error, false);
      all.push(...(page.data ?? []));
      if ((page.data ?? []).length < pageSize) return { data: all, error: null };
    }
  }
  return { data: all, error: null };
}
