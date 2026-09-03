import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * /api/health readiness probe.
 *
 * Phase A findings (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(i)):
 * a degraded result was entirely silent (no logServerError call at all) and
 * the route always returned HTTP 200 regardless of the DB probe's outcome —
 * so nothing that treats 200 as "healthy" could ever notice a real outage
 * from the status code alone. This suite pins the fix: 200 only when
 * healthy, 503 when degraded, a throttled admin_events-visible log on the
 * degraded branch, and a bounded readiness query that cannot hang the route.
 */
const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  scheduleBridgeWrite: vi.fn(async (write: () => Promise<unknown>) => {
    await write();
    return 'awaited' as const;
  }),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('@/lib/admin/schedule-bridge-write', () => ({ scheduleBridgeWrite: mocks.scheduleBridgeWrite }));

type QueryResult = { data: unknown; error: { message: string } | null };

function makeQueryBuilder(
  outcome: QueryResult | (() => Promise<QueryResult>),
): {
  from: (table: string) => { select: (cols: string) => { limit: (n: number) => { abortSignal: (s: AbortSignal) => PromiseLike<QueryResult> } } };
  __fromCalls: string[];
} {
  const fromCalls: string[] = [];
  const resolve = (): Promise<QueryResult> =>
    typeof outcome === 'function' ? outcome() : Promise.resolve(outcome);

  const thenable = {
    then<TResult1, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ) {
      return resolve().then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };

  return {
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: () => ({
          limit: () => ({
            abortSignal: () => thenable as PromiseLike<QueryResult>,
          }),
        }),
      };
    },
    __fromCalls: fromCalls,
  };
}

let currentSupabase: ReturnType<typeof makeQueryBuilder>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => currentSupabase),
}));

import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';
import { GET } from './route';

describe('GET /api/health — healthy', () => {
  beforeEach(() => {
    __resetEmitThrottleForTests();
    mocks.logServerError.mockClear();
    mocks.scheduleBridgeWrite.mockClear();
    currentSupabase = makeQueryBuilder({ data: [{ id: '1' }], error: null });
  });

  it('returns 200 with status healthy when the readiness query succeeds', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('ok');
  });

  it('probes the users table', async () => {
    await GET();
    expect(currentSupabase.__fromCalls).toEqual(['users']);
  });

  it('never logs anything on the healthy path', async () => {
    await GET();
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it('carries a release identifier, never a deployment id', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty('release');
    expect(body).not.toHaveProperty('deploymentId');
  });

  it('carries a timestamp and a responseTimeMs', async () => {
    const res = await GET();
    const body = await res.json();
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.responseTimeMs).toBe('number');
    expect(body.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/health — degraded (query returns an error shape)', () => {
  beforeEach(() => {
    __resetEmitThrottleForTests();
    mocks.logServerError.mockClear();
    mocks.scheduleBridgeWrite.mockClear();
    currentSupabase = makeQueryBuilder({ data: null, error: { message: 'relation "users" does not exist' } });
  });

  it('returns 503 with status degraded — 200 only when healthy (Phase A finding)', async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
  });

  it('logs the degradation through logServerError, skipSentry:true, once per call', async () => {
    await GET();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const [message, ctx, severity] = mocks.logServerError.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(message).toMatch(/degraded/i);
    expect(ctx).toMatchObject({ action: 'api.health', skipSentry: true });
    expect(severity).toBe('warning');
  });

  it('is throttled to once per minute — a burst of degraded polls logs only once', async () => {
    await GET();
    await GET();
    await GET();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it('schedules the write through scheduleBridgeWrite (after()-aware, never a bare void)', async () => {
    await GET();
    expect(mocks.scheduleBridgeWrite).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/health — degraded (thrown exception, e.g. an abort/timeout)', () => {
  beforeEach(() => {
    __resetEmitThrottleForTests();
    mocks.logServerError.mockClear();
    mocks.scheduleBridgeWrite.mockClear();
    currentSupabase = makeQueryBuilder(() => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      throw abortError;
    });
  });

  it('returns 503 with status degraded when the query throws (bounded timeout path)', async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
  });

  it('never lets a thrown error escape the route handler', async () => {
    await expect(GET()).resolves.toBeDefined();
  });

  it('still logs the degradation exactly like the error-shape case', async () => {
    await GET();
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const [, ctx] = mocks.logServerError.mock.calls[0] as [string, Record<string, unknown>];
    expect(ctx).toMatchObject({ action: 'api.health', skipSentry: true });
  });
});

describe('GET /api/health — bounded query (abortSignal wired with the 2.5s budget)', () => {
  beforeEach(() => {
    __resetEmitThrottleForTests();
    mocks.logServerError.mockClear();
  });

  it('passes an AbortSignal into the query chain so a hung request cannot wedge the route forever', async () => {
    let capturedSignal: AbortSignal | undefined;
    currentSupabase = {
      from: () => ({
        select: () => ({
          limit: () => ({
            abortSignal: (signal: AbortSignal) => {
              capturedSignal = signal;
              return Promise.resolve({ data: [], error: null });
            },
          }),
        }),
      }),
      __fromCalls: [],
    };

    await GET();

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
