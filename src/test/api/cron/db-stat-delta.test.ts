/**
 * D5 extension: db-stat-delta must degrade to a fail-open 200 when the new
 * statement-samples RPCs (record_db_statement_samples,
 * helm_debug_read_statement_alert_state) are not yet applied, WITHOUT
 * losing the existing db_stat_deltas write it already performed — same
 * contract as every other collector's `isMigrationNotAppliedError` path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

const SNAPSHOT_DATA = {
  stats_reset_at: '2026-09-01T00:00:00.000Z',
  current: [
    {
      queryid: 'q1',
      calls: 10,
      total_exec_ms: 6000,
      mean_exec_ms: 600,
      max_exec_ms: 900,
      min_exec_ms: 300,
      rows: 100,
      shared_blks_hit: 1,
      shared_blks_read: 1,
      temp_blks_read: 0,
      temp_blks_written: 0,
      wal_bytes: 0,
      safe_query_class: 'unclassified',
      source_class: 'helm_product',
    },
  ],
  prior: {},
};

function buildFake(overrides: { statementSamplesApplied: boolean }) {
  return createFakeSupabase({
    rpc: {
      helm_debug_stat_statements_snapshot: async () => ({ data: SNAPSHOT_DATA, error: null }),
      record_db_stat_snapshot: async () => ({ data: 1, error: null }),
      helm_debug_read_statement_alert_state: async () =>
        overrides.statementSamplesApplied
          ? { data: {}, error: null }
          : { data: null, error: { code: '42883', message: 'function does not exist' } },
      record_db_statement_samples: async () =>
        overrides.statementSamplesApplied
          ? { data: 2, error: null }
          : { data: null, error: { code: '42883', message: 'function does not exist' } },
    },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'secret';
});

async function importRoute() {
  const mod = await import('@/app/api/cron/db-stat-delta/route');
  return mod.GET;
}

function makeRequest() {
  return new Request('http://x/api/cron/db-stat-delta', {
    headers: { authorization: 'Bearer secret' },
  }) as never;
}

describe('db-stat-delta — statement samples extension', () => {
  it('degrades cleanly when the statement-samples RPCs are not applied yet', async () => {
    fake = buildFake({ statementSamplesApplied: false });
    const GET = await importRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The existing delta write still succeeded — statement-sample capture
    // failing must never regress the pre-existing behavior.
    expect(body.rowsWritten).toBe(1);
    expect(body.statementSamples.skipped).toBe('migration-not-applied');
  });

  it('writes statement samples and reports success when the RPCs are applied', async () => {
    fake = buildFake({ statementSamplesApplied: true });
    const GET = await importRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statementSamples).toEqual({});
  });
});
