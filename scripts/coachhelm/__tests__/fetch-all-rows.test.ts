import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs helper, scripts/ is outside tsconfig.
import { fetchAllRows, PAGE_SIZE } from '../fetch-all-rows.mjs';

/**
 * A stand-in for PostgREST: `.range(from, to)` answers the rows in that window, never more than the server's cap, whatever
 * was asked for. That cap is the whole reason the helper exists: `.limit(5000)` returns 1,000 rows and looks complete.
 */
function server(total: number, cap = 1000) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const asked: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    asked.push([from, to]);
    return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, asked };
}
const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id);
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('fetchAllRows (scripts/coachhelm)', () => {
  it('pages in thousands, the cap PostgREST enforces', () => {
    expect(PAGE_SIZE).toBe(1000);
  });

  it('reads every row past the 1,000-row cap, once each and in order', async () => {
    const { page, asked } = server(2350);
    const rows = await fetchAllRows(page, 'players');
    expect(rows).toHaveLength(2350);
    expect(ids(rows)).toEqual(upTo(2350));
    // Three pages of rows, then the empty page that proves the end.
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2350, 3349]]);
  });

  it('a table of exactly one page is still followed by the check that nothing comes after it', async () => {
    const { page, asked } = server(1000);
    expect(await fetchAllRows(page, 'players')).toHaveLength(1000);
    expect(asked).toEqual([[0, 999], [1000, 1999]]);
  });

  it('an empty table is an empty list', async () => {
    const { page, asked } = server(0);
    expect(await fetchAllRows(page, 'players')).toEqual([]);
    expect(asked).toEqual([[0, 999]]);
  });

  it('a server cap under the page size does not cut the list short: a short page is not taken for the last one', async () => {
    // The privacy filter's case: 1,700 people, and a server that hands back 500 at a time whatever is asked.
    const { page } = server(1700, 500);
    const rows = await fetchAllRows(page, 'players');
    expect(ids(rows)).toEqual(upTo(1700));
  });

  it('a failed page throws, naming the read: a partial list is never returned', async () => {
    const { page } = server(2500);
    let calls = 0;
    const failing = async (from: number, to: number) => {
      calls += 1;
      return calls === 2 ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : page(from, to);
    };
    await expect(fetchAllRows(failing, 'all players')).rejects.toThrow('all players: canceling statement due to statement timeout');
  });

  it('a server that never runs out is refused rather than read forever or cut off quietly', async () => {
    const endless = async () => ({ data: [{ id: 1 }], error: null });
    await expect(fetchAllRows(endless, 'players', { maxPages: 5 })).rejects.toThrow(/still returning rows after 5 pages/);
  });

  it('refuses a page size that could not advance', async () => {
    const { page } = server(10);
    await expect(fetchAllRows(page, 'players', { pageSize: 0 })).rejects.toThrow(/page size/);
  });
});
