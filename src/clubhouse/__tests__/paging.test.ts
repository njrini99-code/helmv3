import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { fetchAllRowsTogether } from '../data/paging';

/**
 * A table of `total` rows, answered a page at a time; records each page asked for. `counts`: whether the source answers the row count with
 * the first page (PostgREST does for `count: 'exact'`; a fake may not).
 */
function table(total: number, opts: { failAt?: number; counts?: boolean } = {}) {
  const asked: Array<[number, number]> = [];
  const counted: Array<'exact' | undefined> = [];
  let inFlight = 0;
  let peak = 0;
  const makeQuery = async (from: number, to: number, count: 'exact' | undefined) => {
    asked.push([from, to]);
    counted.push(count);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    if (opts.failAt !== undefined && from === opts.failAt) return { data: null, error: { message: 'boom', code: '57014' } };
    return {
      data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i),
      error: null,
      ...(opts.counts !== false && count === 'exact' ? { count: total } : {}),
    };
  };
  return { makeQuery, asked, counted, peak: () => peak };
}

describe('fetchAllRowsTogether', () => {
  it('a read that fits in one page costs one read, as before', async () => {
    const t = table(10);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(10);
    expect(t.asked).toEqual([[0, 999]]);
  });

  it('the first page asks for the row count, and no later page does', async () => {
    const t = table(3500);
    await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(t.counted).toEqual(['exact', undefined, undefined, undefined]);
  });

  it('with the count, a read of several pages is the first page, then exactly the pages that are there, together: two round trips, none wasted', async () => {
    const t = table(3500);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toBeNull();
    expect(res.data).toEqual(Array.from({ length: 3500 }, (_, i) => i));
    expect(t.asked).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
    expect(t.peak()).toBe(3);
  });

  it('a read of exactly one full page, or of whole pages, asks for no page past the end (the count says so)', async () => {
    const one = table(1000);
    expect((await fetchAllRowsTogether(one.makeQuery, 1000)).data).toHaveLength(1000);
    expect(one.asked).toEqual([[0, 999]]);
    const five = table(5000);
    expect((await fetchAllRowsTogether(five.makeQuery, 1000)).data).toHaveLength(5000);
    expect(five.asked.map(([from]) => from / 1000)).toEqual([0, 1, 2, 3, 4]);
  });

  it('a very long read goes in batches of the most that are asked together', async () => {
    const t = table(20_000);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000, undefined, 8);
    expect(res.data).toHaveLength(20_000);
    expect(t.asked).toHaveLength(20);
    // Pages 1 to 8 together, 9 to 16, then 17 to 19.
    expect(t.peak()).toBe(8);
  });

  it('without a count (a source that does not answer one), a full page is followed by batches until one comes back short', async () => {
    const t = table(3500, { counts: false });
    const res = await fetchAllRowsTogether(t.makeQuery, 1000, undefined, 4);
    expect(res.data).toHaveLength(3500);
    // Page 0, then pages 1 to 4 together: page 3 is short and page 4 is past the end.
    expect(t.asked.map(([from]) => from / 1000)).toEqual([0, 1, 2, 3, 4]);
    const exact = table(5000, { counts: false });
    await fetchAllRowsTogether(exact.makeQuery, 1000, undefined, 2);
    // 0 | 1,2 | 3,4 | 5,6 (page 5 is empty: the read ended exactly at 5,000).
    expect(exact.asked.map(([from]) => from / 1000)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('the first page failing is the whole read failing: no data, the error, nothing further asked', async () => {
    const t = table(3500, { failAt: 0 });
    const res = await fetchAllRowsTogether(t.makeQuery, 1000, { table: 'golf_shots', action: 'test' });
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({ message: 'boom' });
    expect(t.asked).toHaveLength(1);
    expect(maybeCaptureRlsDenial).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.objectContaining({ table: 'golf_shots', action: 'test', verb: 'select' }));
  });

  it('a later page failing ends the read with its error and what was read before it', async () => {
    const t = table(3500, { failAt: 2000 });
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toMatchObject({ message: 'boom' });
    // The first page and the page before the failed one; the pages after it in the same batch are not kept.
    expect(res.data).toHaveLength(2000);
  });
});
