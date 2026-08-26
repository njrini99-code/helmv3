import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `error_rate_hourly` has a schema, RLS policies, and a service-role write
 * grant, but nothing in this repo ever writes to it — verified empty in
 * production 2026-08-26 (see
 * memory/incidents/admin_platform/INC-2026-08-26-error-rate-hourly-never-written.md).
 * `getSystemTabData` used to read it directly and render its permanent
 * silence as a measured "0 errors this hour". These tests pin the fix: the
 * error trend now comes from `admin_events` (a table app code actually
 * writes) via `deriveErrorTrend`, `error_rate_hourly` is never queried, and
 * the invented `userFacingErrors` field is gone rather than faked.
 */

interface FromCall {
  table: string;
  eq: [string, unknown][];
  gte: [string, unknown][];
  order: [string, { ascending: boolean }][];
  limit?: number;
}

const mocks = vi.hoisted(() => ({
  rpcResponses: {} as Record<string, { data: unknown; error: unknown }>,
  fromResponses: {} as Record<string, { data: unknown; error: unknown }>,
  fromCalls: [] as FromCall[],
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  logServerException: vi.fn(async (..._args: unknown[]) => {}),
}));

function makeQueryBuilder(table: string) {
  const call: FromCall = { table, eq: [], gte: [], order: [] };
  mocks.fromCalls.push(call);
  const builder = {
    select: (_cols: string) => builder,
    eq: (col: string, val: unknown) => {
      call.eq.push([col, val]);
      return builder;
    },
    gte: (col: string, val: unknown) => {
      call.gte.push([col, val]);
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      call.order.push([col, opts]);
      return builder;
    },
    limit: (n: number) => {
      call.limit = n;
      return builder;
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(mocks.fromResponses[table] ?? { data: [], error: null }).then(
        resolve,
        reject,
      ),
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (fn: string) => Promise.resolve(mocks.rpcResponses[fn] ?? { data: null, error: null }),
    from: (table: string) => makeQueryBuilder(table),
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin-1', email: 'admin@test.dev' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { role: 'admin' }, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
  logServerException: mocks.logServerException,
}));

import { getSystemTabData } from '@/app/golf/actions/admin-system-data';

const HOUR_MS = 3_600_000;

function hoursAgoIso(n: number): string {
  return new Date(Date.now() - n * HOUR_MS).toISOString();
}

/** Floor a timestamp to its hour bucket start, matching deriveErrorTrend. */
function hourBucketIso(iso: string): string {
  return new Date(Math.floor(Date.parse(iso) / HOUR_MS) * HOUR_MS).toISOString();
}

beforeEach(() => {
  mocks.rpcResponses = {};
  mocks.fromResponses = {};
  mocks.fromCalls = [];
  mocks.logServerError.mockClear();
  mocks.logServerException.mockClear();
});

describe('getSystemTabData — error trend sourcing', () => {
  it('never queries error_rate_hourly and instead reads admin_events filtered to event_type=error', async () => {
    const result = await getSystemTabData();

    const tables = mocks.fromCalls.map((c) => c.table);
    expect(tables).not.toContain('error_rate_hourly');
    expect(tables).toContain('admin_events');

    const adminEventsCall = mocks.fromCalls.find((c) => c.table === 'admin_events')!;
    expect(adminEventsCall.eq).toContainEqual(['event_type', 'error']);
    expect(adminEventsCall.gte.some(([col]) => col === 'created_at')).toBe(true);
    // Descending is load-bearing: if the cap ever truncates, it must drop
    // the OLDEST rows in the window, never the most recent ones. Ascending
    // here would silently fabricate zeros in the newest (most-watched)
    // hours — exactly the failure this fix removes elsewhere.
    expect(adminEventsCall.order).toContainEqual(['created_at', { ascending: false }]);
    expect(result.errorTrendTruncated).toBe(false);
  });

  it('buckets admin_events rows by hour into totalErrors/criticalErrors/affectedUsers, with no userFacingErrors field', async () => {
    const twoHoursAgo = hoursAgoIso(2);
    const twentySixHoursAgo = hoursAgoIso(26);

    mocks.fromResponses.admin_events = {
      data: [
        { created_at: twoHoursAgo, severity: 'error', user_id: 'user-a' },
        { created_at: twoHoursAgo, severity: 'critical', user_id: 'user-b' },
        { created_at: twoHoursAgo, severity: 'critical', user_id: 'user-b' }, // same user twice
        { created_at: twentySixHoursAgo, severity: 'error', user_id: 'user-c' },
      ],
      error: null,
    };

    const result = await getSystemTabData();

    const bucket2h = result.errorTrend.find((e) => e.hour === hourBucketIso(twoHoursAgo));
    expect(bucket2h).toBeDefined();
    expect(bucket2h!.totalErrors).toBe(3);
    expect(bucket2h!.criticalErrors).toBe(2);
    expect(bucket2h!.affectedUsers).toBe(2); // user-a, user-b (deduped)

    const bucket26h = result.errorTrend.find((e) => e.hour === hourBucketIso(twentySixHoursAgo));
    expect(bucket26h).toBeDefined();
    expect(bucket26h!.totalErrors).toBe(1);
    expect(bucket26h!.criticalErrors).toBe(0);
    expect(bucket26h!.affectedUsers).toBe(1);

    // A real "no errors this hour" is representable and distinct from any
    // fabricated field — assert the shape carries only genuinely-derived keys.
    for (const entry of result.errorTrend) {
      expect(Object.keys(entry).sort()).toEqual(
        ['affectedUsers', 'criticalErrors', 'hour', 'totalErrors'].sort(),
      );
    }
  });

  it('degrades errorTrend to [] and logs, without throwing, when the admin_events query errors', async () => {
    mocks.fromResponses.admin_events = {
      data: null,
      error: { message: 'statement timeout' },
    };

    const result = await getSystemTabData();

    expect(result.errorTrend).toEqual([]);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      expect.stringContaining('admin_events (error trend) errored'),
      expect.anything(),
    );
    // Sibling data is unaffected by this one subtree failing.
    expect(result.authMetrics).toEqual([]);
    expect(result.backgroundJobs).toEqual([]);
  });

  it('produces one entry per hour across the trailing-7-day window, including hours with zero events', async () => {
    mocks.fromResponses.admin_events = { data: [], error: null };

    const result = await getSystemTabData();

    // ~7 days of hourly buckets: a real measured zero for every quiet hour,
    // not an empty/absent series standing in for "not measured".
    expect(result.errorTrend.length).toBeGreaterThanOrEqual(167);
    expect(result.errorTrend.length).toBeLessThanOrEqual(170);
    expect(result.errorTrend.every((e) => e.totalErrors === 0)).toBe(true);
    expect(result.errorTrendTruncated).toBe(false);
  });

  it('flags errorTrendTruncated when the row cap is hit, and logs it', async () => {
    // Must match ERROR_TREND_ROW_CAP in admin-system-data.ts. Kept as a
    // literal (not imported) because the module is 'use server' and may
    // only export async functions — this pins the cap's observable
    // behavior rather than reaching into its internals.
    const ERROR_TREND_ROW_CAP = 20000;
    const twoHoursAgo = hoursAgoIso(2);
    mocks.fromResponses.admin_events = {
      data: Array.from({ length: ERROR_TREND_ROW_CAP }, (_, i) => ({
        created_at: twoHoursAgo,
        severity: i % 2 === 0 ? 'critical' : 'error',
        user_id: `user-${i}`,
      })),
      error: null,
    };

    const result = await getSystemTabData();

    expect(result.errorTrendTruncated).toBe(true);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      expect.stringContaining('truncated at ERROR_TREND_ROW_CAP'),
      expect.anything(),
    );
    // The capped rows still bucket correctly — truncation degrades OTHER
    // (dropped) hours, not the hour the returned rows actually belong to.
    const bucket2h = result.errorTrend.find((e) => e.hour === hourBucketIso(twoHoursAgo));
    expect(bucket2h!.totalErrors).toBe(ERROR_TREND_ROW_CAP);
  });
});
