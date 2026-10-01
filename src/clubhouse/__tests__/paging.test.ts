import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { fetchAllRowsTogether } from '../data/paging';

/** A table of `total` rows, answered a page at a time; records each page asked for, and how many were in flight at once. */
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
const pagesAsked = (t: ReturnType<typeof table>) => t.asked.map(([from]) => from / 1000);

describe('fetchAllRowsTogether', () => {
  it('a read that fits in one page costs one read, as before', async () => {
    const t = table(10);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(10);
    expect(t.asked).toEqual([[0, 999]]);
  });

  it('a read of two pages is two round trips, as before (the second batch asks for one page past the end, no more)', async () => {
    const t = table(1500);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000);
    expect(res.data).toHaveLength(1500);
    expect(pagesAsked(t)).toEqual([0, 1, 2]);
  });

  it('three pages are two round trips (not three), six are three (not six): the batches are 2, then 4, then 8', async () => {
    const three = table(2500);
    expect((await fetchAllRowsTogether(three.makeQuery, 1000)).data).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    // Page 0, then 1 and 2 together: page 2 is short and ends the read.
    expect(pagesAsked(three)).toEqual([0, 1, 2]);
    expect(three.peak()).toBe(2);

    const six = table(5800);
    expect((await fetchAllRowsTogether(six.makeQuery, 1000)).data).toHaveLength(5800);
    // 0 | 1,2 | 3,4,5,6 (page 5 is short; page 6 is past the end).
    expect(pagesAsked(six)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(six.peak()).toBe(4);
  });

  it('a long read goes at most `together` pages at a time, and one that ends exactly on a page boundary ends on the empty page', async () => {
    const t = table(20_000);
    const res = await fetchAllRowsTogether(t.makeQuery, 1000, undefined, 4);
    expect(res.data).toHaveLength(20_000);
    expect(t.peak()).toBe(4);
    // 0 | 1,2 | 3,4,5,6 | 7..10 | 11..14 | 15..18 | 19..22 (page 20 is the empty one).
    expect(pagesAsked(t)).toEqual(Array.from({ length: 23 }, (_, i) => i));
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
