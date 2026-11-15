/**
 * Every row of a PostgREST query, read in pages, for the CoachHelm scripts.
 *
 * PostgREST caps every response at 1,000 rows. `.limit(5000)` does not raise the cap: it returns 1,000 rows and looks
 * complete. That matters most where the list is a filter: export-ask-turns.mjs drops any turn that names a person outside
 * the demo roster, and a list of "everyone else" cut off at 1,000 would let the people past the cut through.
 *
 * The same contract as `fetchAllRows` in src/lib/supabase/fetch-all-rows.ts (which a plain .mjs script cannot import),
 * with one difference: this one stops on an EMPTY page, not a short one. A short page proves the end only if the server's
 * cap is at least the page size, and a filter must not rest on that. The price is one extra request per read.
 *
 * `page(from, to)` builds the query fresh on every call and must:
 *   - order by a STABLE key that ends on a unique column (the primary key), or pages drift and rows repeat or go missing;
 *   - end in `.range(from, to)`.
 * A page that fails throws: a partial list is never returned.
 */
export const PAGE_SIZE = 1000;

/** Far past any table these scripts read; stops a server that never returns an empty page. */
const MAX_PAGES = 2000;

/**
 * @template T
 * @param {(from: number, to: number) => PromiseLike<{ data: T[] | null, error: { message: string } | null }>} page
 * @param {string} what  What is being read, for the error message.
 * @param {{ pageSize?: number, maxPages?: number }} [opts]
 * @returns {Promise<T[]>}
 */
export async function fetchAllRows(page, what, opts = {}) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`${what}: page size must be a positive integer`);
  const rows = [];
  for (let n = 0; n < maxPages; n += 1) {
    const from = rows.length;
    const res = await page(from, from + pageSize - 1);
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    const data = res.data ?? [];
    if (data.length === 0) return rows;
    rows.push(...data);
  }
  throw new Error(`${what}: still returning rows after ${maxPages} pages (${rows.length} rows); refusing to treat a partial list as whole`);
}
