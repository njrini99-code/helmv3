/**
 * D5 extension: db-table-health must degrade to a fail-open 200 when the
 * new analysis-snapshot RPCs (helm_debug_db_analysis_snapshot,
 * record_db_analysis_sample) are not yet applied, WITHOUT losing the
 * existing db_table_samples write it already performed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

const TABLE_SNAPSHOT_DATA = {
  current: [
    {
      relation_name: 'public.golf_rounds',
      n_live_tup: 100,
      n_dead_tup: 1,
      last_autovacuum: null,
      last_autoanalyze: null,
      seq_scan: 1,
      idx_scan: 10,
      n_tup_ins: 1,
      n_tup_upd: 1,
      n_tup_del: 0,
      total_bytes: 1000,
      index_bytes: 100,
    },
  ],
  prior: {},
};

const ANALYSIS_SNAPSHOT_DATA = {
  unused_indexes: [{ schema_name: 'public', table_name: 'golf_rounds', index_name: 'idx_unused', idx_scan: 0, index_bytes: 100 }],
  bloat: [{ note: 'pgstattuple extension not installed — bloat estimate skipped, never CREATE EXTENSION from app code' }],
  seq_scan_ratio: [],
  connections: [{ state: 'idle', count: 3 }],
  locks: [],
  index_suggestions: [{ note: 'index_advisor extension not installed — suggestions skipped, never CREATE EXTENSION from app code' }],
  rls_coverage: { tables_missing_policies: [], over_privileged_definers: [] },
  has_pgstattuple: false,
  has_index_advisor: false,
};

function buildFake(overrides: { analysisApplied: boolean }) {
  return createFakeSupabase({
    rpc: {
      helm_debug_db_table_snapshot: async () => ({ data: TABLE_SNAPSHOT_DATA, error: null }),
      record_db_table_samples: async () => ({ data: 1, error: null }),
      helm_debug_db_analysis_snapshot: async () =>
        overrides.analysisApplied
          ? { data: ANALYSIS_SNAPSHOT_DATA, error: null }
          : { data: null, error: { code: '42883', message: 'function does not exist' } },
      record_db_analysis_sample: async () =>
        overrides.analysisApplied
          ? { data: 4, error: null }
          : { data: null, error: { code: '42883', message: 'function does not exist' } },
    },
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'secret';
});

async function importRoute() {
  const mod = await import('@/app/api/cron/db-table-health/route');
  return mod.GET;
}

function makeRequest() {
  return new Request('http://x/api/cron/db-table-health', {
    headers: { authorization: 'Bearer secret' },
  }) as never;
}

describe('db-table-health — analysis extension', () => {
  it('degrades cleanly when the analysis RPCs are not applied yet', async () => {
    fake = buildFake({ analysisApplied: false });
    const GET = await importRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rowsWritten).toBe(1);
    expect(body.analysis.skipped).toBe('migration-not-applied');
  });

  it('writes analysis rows and reports the count when the RPCs are applied', async () => {
    fake = buildFake({ analysisApplied: true });
    const GET = await importRoute();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toEqual({ rowsWritten: 4 });
  });
});
