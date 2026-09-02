import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { AutoResolveResult } from '@/lib/admin/auto-resolve';

/**
 * Retention-purge batching contract.
 *
 * THE BUG THIS FILE EXISTS FOR (found 2026-07-31, alongside the identical one
 * in auto-resolve.ts's Rule C). `purgeBatch` selected a page of victim ids and
 * deleted them with ONE `.in('id', ids)`. PostgREST puts filters in the query
 * string, so ~1,000 uuids is a ~39 KB request URI, and Supabase's edge answers
 * `400 Bad Request` well before Postgres sees it — measured ceiling on this
 * project is 584 ids (~22.8 KB). Nothing caught it because the purge is only
 * ever handed a few rows a night; the first night more than ~584 rows aged out
 * at once, the delete would have thrown and — unlike auto-resolve, which the
 * route wraps in try/catch — taken the whole retention cron down with it.
 *
 * The companion defect: `.limit(BATCH)` at BATCH = 5000 never raised
 * PostgREST's own 1,000-row cap, so a *full* page always looked "short" and
 * the drain loop returned after one pass, capping every purge at 1,000 rows.
 */

const mocks = vi.hoisted(() => ({
  /**
   * Rows each purge still has to work through, keyed `${table}|${severities}`.
   *
   * The key HAS to carry the severity filter: the route calls
   * `purgeAdminEvents` twice against the same table with different severity
   * sets, so a mock keyed on table alone lets the second call finish the
   * first call's backlog — which makes the drain assertion below pass even
   * when the drain loop is broken. Learned the hard way.
   */
  rows: new Map<string, string[]>(),
  /** Every `.in('id', ids)` batch handed to a delete, in order. */
  deleteBatches: [] as Array<{ table: string; ids: string[] }>,
}));

/** PostgREST truncates ANY request to 1,000 rows; `.limit(n)` above that is
 *  silently ignored, it does not raise the cap. */
const { POSTGREST_MAX_ROWS } = vi.hoisted(() => ({ POSTGREST_MAX_ROWS: 1000 }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        let bucket = `${table}|`;
        const chain = {
          in: (col: string, values: string[]) => {
            if (col === 'severity') bucket = `${table}|${values.join(',')}`;
            return chain;
          },
          lt: () => chain,
          order: () => chain,
          limit: (n: number) => {
            const remaining = mocks.rows.get(bucket) ?? [];
            const served = Math.min(n, POSTGREST_MAX_ROWS);
            return Promise.resolve({ data: remaining.slice(0, served).map((id) => ({ id })), error: null });
          },
        };
        return chain;
      },
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          mocks.deleteBatches.push({ table, ids });
          const gone = new Set(ids);
          // The delete carries no severity filter, so drop the ids from every
          // bucket of this table — exactly what deleting by primary key does.
          for (const [key, remaining] of mocks.rows) {
            if (!key.startsWith(`${table}|`)) continue;
            mocks.rows.set(key, remaining.filter((id) => !gone.has(id)));
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const { recordedRuns } = vi.hoisted(() => ({
  recordedRuns: [] as Array<{ jobType: string; outcome: 'completed' | 'failed' }>,
}));

// Pass-through as before, but now it RECORDS which job types were wrapped and
// whether the wrapped work threw — the two facts ET-3 is about. The real
// `recordJobRun` writes a 'failed' row and rethrows, so the mock rethrows too:
// a mock that swallowed the throw would hide the very behaviour under test.
vi.mock('@/lib/admin/job-log', () => ({
  recordJobRun: async <T,>(jobType: string, fn: () => Promise<T>): Promise<T> => {
    try {
      const result = await fn();
      recordedRuns.push({ jobType, outcome: 'completed' });
      return result;
    } catch (err) {
      recordedRuns.push({ jobType, outcome: 'failed' });
      throw err;
    }
  },
}));

vi.mock('@/lib/admin/incident-resolver', () => ({
  archiveKnownResolvedIncidents: async () => ({ archived: 0, buckets: {} }),
}));

const { autoResolveMock } = vi.hoisted(() => ({
  autoResolveMock: vi.fn<() => Promise<AutoResolveResult>>(async () => ({
    resolvedRelease: 0,
    resolvedQuiet: 0,
    resolvedLegacy: 0,
    resolvedNonActionable: 0,
    fingerprints: 0,
    deploySha: null,
    ledger: { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: null },
    regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
  })),
}));

vi.mock('@/lib/admin/auto-resolve', () => ({
  autoResolveFixedIncidents: autoResolveMock,
}));

function request(secret = 'cron-secret'): NextRequest {
  return new NextRequest('https://helmsportslabs.com/api/cron/log-retention', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

async function loadRoute() {
  const mod = await import('@/app/api/cron/log-retention/route');
  return mod.GET;
}

describe('GET /api/cron/log-retention', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.rows = new Map();
    mocks.deleteBatches = [];
    autoResolveMock.mockReset();
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 0,
      deploySha: null,
      ledger: { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: null },
      regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a request without the cron secret', async () => {
    const GET = await loadRoute();
    const res = await GET(request('wrong-secret'));
    expect(res.status).toBe(401);
    expect(mocks.deleteBatches).toHaveLength(0);
  });

  it('chunks every delete so the request URI can never overflow', async () => {
    mocks.rows.set(
      'admin_events|info,warning',
      Array.from({ length: 1500 }, (_, i) => `row-${i}`),
    );

    const GET = await loadRoute();
    const res = await GET(request());
    expect(res.status).toBe(200);

    expect(mocks.deleteBatches.length).toBeGreaterThan(1);
    for (const batch of mocks.deleteBatches) {
      expect(batch.ids.length).toBeLessThanOrEqual(200);
    }
  });

  it('drains a backlog larger than one PostgREST page', async () => {
    mocks.rows.set(
      'admin_events|info,warning',
      Array.from({ length: 1500 }, (_, i) => `row-${i}`),
    );

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as { deleted: number };

    // A full 1,000-row page must not be mistaken for "backlog drained".
    expect(body.deleted).toBe(1500);
    expect(mocks.rows.get('admin_events|info,warning')).toHaveLength(0);
    // Nothing may be deleted twice.
    const touched = mocks.deleteBatches.flatMap((b) => b.ids);
    expect(new Set(touched).size).toBe(touched.length);
  });

  it('flattens a clean resolution pass into top-level scalars, undegraded', async () => {
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 2,
      resolvedQuiet: 1,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 3,
      deploySha: 'abc123',
      ledger: { recorded: 3, skippedManual: 1, failed: 0, capped: 0, firstError: null },
      regressions: { marked: 1, failed: 0, capped: 0, firstError: null },
    });

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(false);
    // Every field `recordJobRun`'s extractOutcomeMetadata can actually keep
    // (top-level string/number/boolean) must be present directly on the body —
    // a nested `ledger`/`regressions` object here would be silently dropped
    // before it ever reached background_job_logs.metadata.
    expect(body.ledgerRecorded).toBe(3);
    expect(body.ledgerSkippedManual).toBe(1);
    expect(body.ledgerFailed).toBe(0);
    expect(body.ledgerCapped).toBe(0);
    expect(body.regressionsMarked).toBe(1);
    expect(body.regressionsFailed).toBe(0);
    expect(body.regressionsCapped).toBe(0);
    // Encodes extractOutcomeMetadata's actual rule (job-log.ts), not just
    // presence: every flattened field must be a scalar it can keep, so a
    // later "tidy this up" that re-nests them under `ledger: {…}` fails here
    // instead of silently going invisible in background_job_logs.metadata.
    for (const key of [
      'ledgerRecorded',
      'ledgerSkippedManual',
      'ledgerFailed',
      'ledgerCapped',
      'regressionsMarked',
      'regressionsFailed',
      'regressionsCapped',
      'degraded',
    ]) {
      expect(['string', 'number', 'boolean']).toContain(typeof body[key]);
    }
    // No cause to report on a clean pass.
    expect(body).not.toHaveProperty('ledgerFirstError');
    expect(body).not.toHaveProperty('regressionsFirstError');
    expect(body).not.toHaveProperty('regressionSkippedReason');
  });

  it('surfaces the ledger failure cause and reports the run as degraded, without failing the cron', async () => {
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 1,
      deploySha: null,
      ledger: {
        recorded: 0,
        skippedManual: 0,
        failed: 1,
        capped: 0,
        firstError: 'fp-123: connection reset',
      },
      regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
    });

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    // A retryable per-fingerprint RPC failure must not turn a red cron —
    // next night's pass re-decides it from fresh occurrence data. Only the
    // `degraded` signal changes.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.ledgerFailed).toBe(1);
    expect(body.ledgerFirstError).toBe('fp-123: connection reset');
  });

  it('surfaces a regression-write failure as degraded with its cause', async () => {
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 0,
      deploySha: null,
      ledger: { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: null },
      regressions: { marked: 0, failed: 1, capped: 0, firstError: 'fp-999: rpc timeout' },
    });

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.regressionsFailed).toBe(1);
    expect(body.regressionsFirstError).toBe('fp-999: rpc timeout');
  });

  it('surfaces a capped ledger pass rather than reading as fully covered', async () => {
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 600,
      deploySha: null,
      ledger: { recorded: 500, skippedManual: 0, failed: 0, capped: 100, firstError: null },
      regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
    });

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.ledgerCapped).toBe(100);
  });

  it('surfaces the regression-skip reason when regression detection could not run', async () => {
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 0,
      deploySha: null,
      ledger: { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: null },
      regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
      regressionSkippedReason: 'resolutions read failed: connection reset',
    });

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.regressionSkippedReason).toBe('resolutions read failed: connection reset');
    // `regressionSkippedReason` is only ever set when the resolutions read
    // failed (see auto-resolve.ts) — regression detection never ran, so
    // "nothing regressed" was never established. That is not a clean pass:
    // reporting `degraded: false` here would be the unknown->healthy collapse
    // the OS contract bans.
    expect(body.degraded).toBe(true);
  });

  it('treats a thrown/caught autoResolveFixedIncidents failure as degraded with its message as the cause, without failing the cron', async () => {
    autoResolveMock.mockRejectedValue(new Error('autoResolveFixedIncidents boom'));

    const GET = await loadRoute();
    const res = await GET(request());
    const body = (await res.json()) as Record<string, unknown>;

    // runAutoResolve's fail-soft wrapper converts the throw into
    // `{ error: message }` so the retention purge (the route's own job)
    // still runs and still returns 200.
    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.ledgerFailed).toBe(0);
    expect(body.ledgerFirstError).toBe('autoResolveFixedIncidents boom');
  });
});

// ---------------------------------------------------------------------------
// ET-3 — Close needs its own heartbeat.
//
// `SELFHEAL_STAGES` used `log-retention` as the Close stage's heartbeat. But
// this route deliberately fail-softs an `autoResolveFixedIncidents()` failure
// so the independent retention purge still runs, then returns 200 and records
// `log-retention` = 'completed'.
//
// So Close's actual work — the auto-resolution — could fail completely while
// the Self-Heal circuit read a closed loop off a heartbeat that belongs to a
// different job. #1664 made `degraded` READABLE; it did not make the signal
// Close's own. Retention succeeding is not evidence about Close.
// ---------------------------------------------------------------------------
describe('log-retention — Close owns its own heartbeat', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.rows = new Map();
    mocks.deleteBatches = [];
    recordedRuns.length = 0;
    autoResolveMock.mockReset();
    autoResolveMock.mockResolvedValue({
      resolvedRelease: 0,
      resolvedQuiet: 0,
      resolvedLegacy: 0,
      resolvedNonActionable: 0,
      fingerprints: 0,
      deploySha: null,
      ledger: { recorded: 0, skippedManual: 0, failed: 0, capped: 0, firstError: null },
      regressions: { marked: 0, failed: 0, capped: 0, firstError: null },
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records a selfheal-close run distinct from the retention run', async () => {
    const GET = await loadRoute();
    await GET(request());

    const types = recordedRuns.map((r) => r.jobType);
    expect(types).toContain('log-retention');
    expect(types).toContain('selfheal-close');
  });

  it('a failed auto-resolve marks selfheal-close FAILED while retention still completes', async () => {
    // The false-green, stated as an outcome pair. Before ET-3 there was only
    // one row and it said 'completed'.
    autoResolveMock.mockRejectedValueOnce(new Error('auto-resolve exploded'));

    const GET = await loadRoute();
    const res = await GET(request());

    expect(res.status).toBeLessThan(400); // retention is independent, still 200
    expect(recordedRuns).toContainEqual({ jobType: 'selfheal-close', outcome: 'failed' });
    expect(recordedRuns).toContainEqual({ jobType: 'log-retention', outcome: 'completed' });
  });
});
