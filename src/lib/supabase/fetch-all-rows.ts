/**
 * Fetch ALL rows from a Supabase/PostgREST query, transparently paginating past
 * the server-side default cap (PostgREST returns at most 1000 rows per request).
 *
 * Stats/analytics code aggregates `golf_holes` and `golf_shots` across many
 * rounds — a team season easily exceeds 1000 hole/shot rows. An unpaginated
 * `.in('round_id', roundIds)` silently truncates at 1000, producing
 * under-counted putts / GIR% / fairway% and other wrong aggregates.
 *
 * Usage — the caller builds the query and MUST apply a STABLE `.order(...)` on a
 * unique column (e.g. the primary key `id`) so page boundaries don't drift:
 *
 *   const holes = await fetchAllRows<HoleRow>((from, to) =>
 *     supabase
 *       .from('golf_holes')
 *       .select('round_id, par, gir, putts')
 *       .in('round_id', roundIds)
 *       .order('id', { ascending: true })
 *       .range(from, to)
 *   );
 */
const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  // Bound the loop defensively; 1000 pages * 1000 rows = 1M rows is far beyond
  // any realistic stats dataset and prevents an infinite loop on a misbehaving
  // backend that never returns a short page.
  for (let page = 0; page < 1000; page += 1) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) {
      throw new Error(`fetchAllRows: ${error.message}`);
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Same pagination as {@link fetchAllRows}, but returns the familiar
 * `{ data, error }` shape instead of throwing — so call sites that already do
 * `const { data, error } = await supabase.from(...)...` can adopt pagination
 * with a near-identical destructure and keep their existing error branches.
 *
 *   const { data: shots, error } = await fetchAllRowsResult((from, to) =>
 *     supabase.from('golf_shots').select('...').in('round_id', ids)
 *       .order('id', { ascending: true }).range(from, to));
 *
 * T is inferred from the PostgREST builder, so no explicit type argument is
 * needed at the call site. On the first page error, `data` is null and `error`
 * carries the original PostgREST error (matching the unpaginated behavior).
 */
export async function fetchAllRowsResult<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;

  for (let page = 0; page < 1000; page += 1) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) {
      // Preserve the unpaginated contract: surface the error, null data.
      return { data: from === 0 ? null : all, error };
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}
