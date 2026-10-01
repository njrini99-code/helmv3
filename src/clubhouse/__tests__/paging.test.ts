import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { fetchAllRowsTogether } from '../data/paging';

/** A table of `total` rows, answered a page at a time; records each page asked for and when it was asked. */
function table(total: number, opts: { failAt?: number } = {}) {
  const asked: Array<[number, number]> = [];
  let inFlight = 0;
  let peak = 0;
  const makeQuery = async (from: number, to: number) => {
    asked.push([from, to]);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    if (opts.failAt !== undefined && from === opts.failAt) return { data: null, error: { message: 'boom', code: '57014' } };
    return { data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i), error: null };
  };
  return { makeQuery, asked, peak: () => peak };
}

describe('fetchAllRowsTogether', () => {
  it('a read that fits in one page costs one read, as before', async () => {
    const t = table(10);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(10);
    expect(t.asked).toEqual([[0, 999]]);
  });

  it('a read of several pages asks for them together after the first, in order, and stops at the short page', async () => {
    const t = table(3500);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toBeNull();
    expect(res.data).toEqual(Array.from({ length: 3500 }, (_, i) => i));
    // The first page alone, then pages 2 to 5 together (a round trip each way instead of four).
    expect(t.asked).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999]]);
    expect(t.peak()).toBe(4);
  });

  it('keeps going in batches while every page is full, and a read that ends exactly on a page boundary ends on the empty page', async () => {
    const t = table(5000);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000, undefined, 2);
    expect(res.data).toHaveLength(5000);
    // 0 | 1,2 | 3,4 | 5,6 (page 5 is empty: the read ended exactly at 5,000).
    expect(t.asked.map(([from]) => from / 1000)).toEqual([0, 1, 2, 3, 4, 5, 6]);
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
    expect(res.data).toHaveLength(2000);
  });
});
