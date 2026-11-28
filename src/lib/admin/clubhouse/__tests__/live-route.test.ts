/**
 * The hourly reads ask for the screen each row fired on (the route column, held migration 20261128090000) while it
 * may be there. Until it is applied the database refuses the column: the same read runs again without it, nothing
 * shows as an error, and the column isn't asked for again for ROUTE_RETRY_MS.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Call = { select: string; orders: string[] };
const calls: Call[] = [];
let routeThere = false;

function query(call: Call) {
  const q = {
    gte: () => q,
    lt: () => q,
    eq: () => q,
    in: () => q,
    or: () => q,
    order: (c: string) => {
      call.orders.push(c);
      return q;
    },
    range: async () => {
      if (call.select.includes('route') && !routeThere) {
        return { data: null, error: { code: '42703', message: 'column clubhouse_signal_hourly.route does not exist' } };
      }
      const row = { bucket_hour: '2026-11-28T09:00:00Z', code: '', kind: 'view', outcome: '', act: '', role: 'coach', platform: 'desktop', release: 'r1', bridge_id: null, page_id: 'P013', signal_count: '2', user_ids: [], duration_buckets: [], last_at: '2026-11-28T09:05:00Z' };
      return { data: [call.select.includes('route') ? { ...row, route: '/golf/dashboard/coachhelm?view=ask' } : row], error: null };
    },
  };
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        const call: Call = { select: cols, orders: [] };
        calls.push(call);
        return query(call);
      },
    }),
  }),
}));

const { readHourly, readHourlyAt, resetRouteColumnForTests, ROUTE_RETRY_MS } = await import('../live');

afterEach(() => {
  calls.length = 0;
  routeThere = false;
  resetRouteColumnForTests();
  vi.useRealTimers();
});

describe('hourly reads and the route column', () => {
  it('reads each row’s screen once the column is there, ordered by the whole key', async () => {
    routeThere = true;
    const read = await readHourly({ sinceIso: '2026-11-28T08:00:00Z' });
    expect(read.state).toBe('ok');
    expect(read.data[0]).toMatchObject({ page_id: 'P013', route: '/golf/dashboard/coachhelm?view=ask', signal_count: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.orders).toEqual(['bucket_hour', 'code', 'kind', 'outcome', 'act', 'page_id', 'route', 'role', 'platform', 'release']);
  });

  it('while the migration is held: the same read without it, no error, and the column left alone for a while', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 28, 9), toFake: ['Date'] });
    const read = await readHourly({ sinceIso: '2026-11-28T08:00:00Z' });
    expect(read.state).toBe('ok');
    expect(read.data[0]!.route).toBeUndefined();
    expect(calls.map((c) => c.select.includes('route'))).toEqual([true, false]);
    expect(calls[1]!.orders).not.toContain('route');

    calls.length = 0;
    await readHourlyAt(['2026-11-28T09:00:00Z']);
    expect(calls.map((c) => c.select.includes('route'))).toEqual([false]);

    calls.length = 0;
    routeThere = true;
    vi.setSystemTime(Date.now() + ROUTE_RETRY_MS);
    const later = await readHourly({});
    expect(calls.map((c) => c.select.includes('route'))).toEqual([true]);
    expect(later.data[0]!.route).toBe('/golf/dashboard/coachhelm?view=ask');
  });
});
