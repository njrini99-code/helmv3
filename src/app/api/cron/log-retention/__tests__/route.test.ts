import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/admin/job-log', () => ({
  recordJobRun: async <T,>(_jobType: string, fn: () => Promise<T>): Promise<T> => fn(),
}));

vi.mock('@/lib/admin/incident-resolver', () => ({
  archiveKnownResolvedIncidents: async () => ({ archived: 0, buckets: {} }),
}));

vi.mock('@/lib/admin/auto-resolve', () => ({
  autoResolveFixedIncidents: async () => ({
    resolvedRelease: 0,
    resolvedQuiet: 0,
    resolvedLegacy: 0,
    fingerprints: 0,
    deploySha: null,
  }),
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
});
