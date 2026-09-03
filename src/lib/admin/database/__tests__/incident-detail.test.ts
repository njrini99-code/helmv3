import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), readDriftInputs: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })) }));
vi.mock('@/lib/admin/database/drift-inputs', () => ({ readSchemaDriftInputs: mocks.readDriftInputs }));

import {
  buildIncidentTitle,
  buildWorkflowStages,
  fetchDatabaseIncidentDetail,
  primaryClassFor,
} from '../incident-detail';
import { attributeServiceLayer } from '@/lib/observability/supabase/service-layers';

const FINGERPRINT = 'supabase|postgrest|round_tracking|rpc|save_partial_round_atomic|42501';

function errorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    fingerprint: FINGERPRINT,
    service: 'postgrest',
    environment: 'production',
    release_sha: 'abc1234',
    feature: 'round_tracking',
    action: 'save_partial_round',
    operation: 'rpc',
    relation_name: null,
    rpc_name: 'save_partial_round_atomic',
    error_code: '42501',
    sqlstate: '42501',
    severity: 'error',
    expectedness: 'unexpected',
    retryability: 'no',
    normalized_message: 'permission denied for function save_partial_round_atomic',
    safe_details: null,
    safe_hint: null,
    occurrence_count: 3,
    first_seen_at: '2026-09-03T10:00:00.000Z',
    last_seen_at: '2026-09-03T11:00:00.000Z',
    helm_trace_id: 'helm-trace-1',
    sentry_trace_id: 'sentry-trace-1',
    ...overrides,
  };
}

const CLEAN_DRIFT_INPUTS = {
  ledger: { filesReadable: true, files: [], appliedVersions: [], heldVersions: [] },
  types: { readable: true, tables: [], columns: [], functions: [] },
};

/** Routes each RPC name to a stubbed result. Anything unstubbed returns empty. */
function stubRpcs(byName: Record<string, { data: unknown; error: unknown }>) {
  mocks.rpc.mockImplementation((name: string) => {
    const result = byName[name] ?? { data: [], error: null };
    return Promise.resolve(result);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readDriftInputs.mockResolvedValue(CLEAN_DRIFT_INPUTS);
});

describe('primaryClassFor', () => {
  it('names the brief §34 classes for the codes that have one', () => {
    expect(primaryClassFor('42501')).toBe('DATABASE_AUTHORIZATION');
    expect(primaryClassFor('42P01')).toBe('DATABASE_SCHEMA_MISMATCH');
    expect(primaryClassFor('57014')).toBe('DATABASE_TIMEOUT');
    expect(primaryClassFor('PGRST003')).toBe('DATABASE_POOL_TIMEOUT');
  });

  it('falls back through SQLSTATE class prefixes, then to unclassified', () => {
    expect(primaryClassFor('08006')).toBe('DATABASE_CONNECTION');
    expect(primaryClassFor('XX000')).toBe('DATABASE_INTERNAL');
    expect(primaryClassFor('ZZ999')).toBe('DATABASE_UNCLASSIFIED');
    expect(primaryClassFor(null)).toBe('DATABASE_UNCLASSIFIED');
  });
});

describe('buildIncidentTitle', () => {
  it('is built from safe dimensions and never from the message', () => {
    const title = buildIncidentTitle({
      feature: 'round_tracking',
      action: 'save_partial_round',
      operation: 'rpc',
      rpc_name: 'save_partial_round_atomic',
      relation_name: null,
      error_code: '42501',
    });
    expect(title).toBe('round_tracking/save_partial_round: rpc on save_partial_round_atomic failed with 42501');
  });

  it('names the object as unnamed rather than omitting it', () => {
    const title = buildIncidentTitle({
      feature: 'f',
      action: 'a',
      operation: 'select',
      rpc_name: null,
      relation_name: null,
      error_code: null,
    });
    expect(title).toContain('an unnamed object');
    expect(title).toContain('no code');
  });
});

describe('buildWorkflowStages', () => {
  it('marks the failing stage and leaves later stages not-reached', () => {
    const attribution = attributeServiceLayer({
      service: 'postgrest',
      sqlstate: '42501',
      postgrestCode: null,
      authCode: null,
      storageCode: null,
      code: '42501',
      httpStatus: null,
    });
    const stages = buildWorkflowStages(attribution);
    const failing = stages.find((s) => s.status === 'failed-here');
    expect(failing?.stage).toBe('postgres-execution');
    expect(stages.find((s) => s.stage === 'commit')?.status).toBe('not-reached');
    expect(stages.find((s) => s.stage === 'server-action')?.status).toBe('reached');
  });

  it('marks EVERY stage unknown when the origin layer is ambiguous — a guessed marker is worse than none', () => {
    const attribution = attributeServiceLayer({
      service: 'postgrest',
      sqlstate: null,
      postgrestCode: 'PGRST003',
      authCode: null,
      storageCode: null,
      code: 'PGRST003',
      httpStatus: null,
    });
    const stages = buildWorkflowStages(attribution);
    expect(stages.every((s) => s.status === 'unknown')).toBe(true);
  });
});

describe('fetchDatabaseIncidentDetail', () => {
  it('degrades to unconfigured when the error store migration is not applied', async () => {
    stubRpcs({
      helm_debug_read_db_error_events: { data: null, error: { code: '42883', message: 'undefined function' } },
    });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(result.status).toBe('unconfigured');
  });

  it('surfaces a genuine read failure as an error, not as unconfigured', async () => {
    stubRpcs({
      helm_debug_read_db_error_events: { data: null, error: { code: '08006', message: 'connection failure' } },
    });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(result.status).toBe('error');
  });

  it('errors when no event matches the fingerprint', async () => {
    stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow({ fingerprint: 'other' })], error: null } });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(result.status).toBe('error');
    expect(result.error).toContain('No database error events found');
  });

  it('composes identity, occurrences across buckets, and the earliest first-seen', async () => {
    stubRpcs({
      helm_debug_read_db_error_events: {
        data: [
          errorRow({ occurrence_count: 3, first_seen_at: '2026-09-03T10:00:00.000Z', last_seen_at: '2026-09-03T11:00:00.000Z' }),
          errorRow({ id: 'row-0', occurrence_count: 7, first_seen_at: '2026-09-03T08:00:00.000Z', last_seen_at: '2026-09-03T09:00:00.000Z' }),
        ],
        error: null,
      },
    });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(result.status).toBe('ok');
    expect(result.data?.identity.occurrences).toBe(10);
    expect(result.data?.identity.firstSeenAt).toBe('2026-09-03T08:00:00.000Z');
    expect(result.data?.identity.lastSeenAt).toBe('2026-09-03T11:00:00.000Z');
    expect(result.data?.bucketCount).toBe(2);
    expect(result.data?.identity.primaryClass).toBe('DATABASE_AUTHORIZATION');
  });

  it('reads the authorization expectation back from the stored expectedness, never guessing it', async () => {
    stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow({ expectedness: 'expected' })], error: null } });
    const expected = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(expected.data?.authorization.verdict).toBe('EXPECTED_SECURITY_DENIAL');

    stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow({ expectedness: 'unknown' })], error: null } });
    const unknown = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(unknown.data?.authorization.verdict).toBe('UNKNOWN');
  });

  it('attributes a PostgREST-relayed SQLSTATE to Postgres', async () => {
    stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    expect(result.data?.serviceLayer.observedLayer).toBe('postgrest');
    expect(result.data?.serviceLayer.likelyOriginLayer).toBe('postgres');
  });

  describe('every section degrades on its own', () => {
    it('a HELD health migration renders unconfigured, never an empty green', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_health_history: { data: null, error: { code: 'PGRST202', message: 'could not find the function' } },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.status).toBe('ok');
      expect(result.data?.healthAtTheTime.state).toBe('unconfigured');
      expect(result.data?.healthAtTheTime.data).toBeNull();
    });

    it('a HELD locks migration does not report "no locks"', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_lock_incidents: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.locksAtTheTime.state).toBe('unconfigured');
    });

    it('a real read failure on one section is blind, not unconfigured', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_stat_deltas: { data: null, error: { code: '08006', message: 'connection failure' } },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.queryHealth.state).toBe('blind');
    });

    it('an empty section is "empty", which is distinct from unconfigured and blind', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_lock_incidents: { data: [], error: null },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.locksAtTheTime.state).toBe('empty');
      expect(result.data?.locksAtTheTime.note).toContain('No lock incident');
    });

    it('data invariants and the Sentry issue are declared unconfigured, never rendered as passing', async () => {
      stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.dataInvariant.state).toBe('unconfigured');
      expect(result.data?.sentryIssue.state).toBe('unconfigured');
    });
  });

  describe('health and locks at the time', () => {
    it('picks the nearest health sample within the proximity window', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_health_history: {
          data: [
            { sampled_at: '2026-09-03T10:55:00.000Z', connections_pct_max: 0.4, cache_hit_ratio: 0.99, xact_rollback_delta: 2, deadlocks_delta: 0, longest_lock_wait_ms: null },
            { sampled_at: '2026-09-03T09:00:00.000Z', connections_pct_max: 0.1, cache_hit_ratio: 0.99, xact_rollback_delta: 0, deadlocks_delta: 0, longest_lock_wait_ms: null },
          ],
          error: null,
        },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.healthAtTheTime.state).toBe('ok');
      expect(result.data?.healthAtTheTime.data?.sampledAt).toBe('2026-09-03T10:55:00.000Z');
      expect(result.data?.healthAtTheTime.data?.offsetMinutes).toBe(5);
    });

    it('refuses a health sample too far from the incident rather than presenting it as "at the time"', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_health_history: {
          data: [{ sampled_at: '2026-09-02T10:00:00.000Z', connections_pct_max: 0.4, cache_hit_ratio: 0.99, xact_rollback_delta: 0, deadlocks_delta: 0, longest_lock_wait_ms: null }],
          error: null,
        },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.healthAtTheTime.state).toBe('empty');
    });

    it('keeps only lock incidents near the occurrence', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_lock_incidents: {
          data: [
            { detected_at: '2026-09-03T10:50:00.000Z', kind: 'lock_wait', severity: 'warning', wait_ms: 900, relation_name: 'golf_rounds', feature: 'round_tracking' },
            { detected_at: '2026-09-01T10:00:00.000Z', kind: 'deadlock', severity: 'critical', wait_ms: null, relation_name: null, feature: null },
          ],
          error: null,
        },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.locksAtTheTime.data).toHaveLength(1);
      expect(result.data?.locksAtTheTime.data?.[0]?.kind).toBe('lock_wait');
    });

    it('shows only flagged query regressions, not the whole workload', async () => {
      stubRpcs({
        helm_debug_read_db_error_events: { data: [errorRow()], error: null },
        helm_debug_read_db_stat_deltas: {
          data: [
            { sampled_at: '2026-09-03T11:00:00.000Z', safe_query_class: 'select golf_rounds', source_class: 'product', calls_delta: 10, mean_exec_ms_window: 5, regression_flags: [], baseline_status: 'established' },
            { sampled_at: '2026-09-03T11:00:00.000Z', safe_query_class: 'rpc save_partial_round_atomic', source_class: 'product', calls_delta: 40, mean_exec_ms_window: 900, regression_flags: ['mean_exec_ms'], baseline_status: 'established' },
          ],
          error: null,
        },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.queryHealth.data).toHaveLength(1);
      expect(result.data?.queryHealth.data?.[0]?.regressionFlags).toEqual(['mean_exec_ms']);
    });
  });

  describe('release correlation', () => {
    it('is unconfigured without a deploy time — the ladder is not computable', async () => {
      stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.releaseCorrelation.state).toBe('unconfigured');
      expect(result.data?.releaseCorrelation.data?.confidence).toBe('unknown');
    });

    it('computes the ladder once a deploy time is supplied', async () => {
      stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT, {
        releaseFacts: { deployedAtMs: Date.parse('2026-09-03T09:30:00.000Z') },
      });
      expect(result.data?.releaseCorrelation.state).toBe('ok');
      // Proximity only, nothing corroborating — the ceiling.
      expect(result.data?.releaseCorrelation.data?.confidence).toBe('possible');
      expect(result.data?.releaseCorrelation.data?.corroborating).toEqual([]);
    });
  });

  describe('schema drift', () => {
    it('is blind, with the diagnosis still attached, when neither drift input can be read', async () => {
      mocks.readDriftInputs.mockResolvedValue({
        ledger: { filesReadable: false, files: [], appliedVersions: null, heldVersions: null },
        types: { readable: false, tables: [], columns: [], functions: [] },
      });
      stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.schemaDrift.state).toBe('blind');
      expect(result.data?.schemaDrift.data?.verdict).toBe('not-applicable'); // 42501 is not a missing object
    });

    it('attaches a held-migration verdict and a HELD.md repair link to a missing-object incident', async () => {
      mocks.readDriftInputs.mockResolvedValue({
        ledger: {
          filesReadable: true,
          files: [{ version: '20260901120000', filename: '20260901120000_notes.sql', objects: ['golf_round_notes'] }],
          appliedVersions: [],
          heldVersions: ['20260901120000'],
        },
        types: { readable: true, tables: [], columns: [], functions: [] },
      });
      stubRpcs({
        helm_debug_read_db_error_events: {
          data: [
            errorRow({
              error_code: '42P01',
              sqlstate: '42P01',
              relation_name: 'golf_round_notes',
              rpc_name: null,
              operation: 'select',
              normalized_message: 'relation "golf_round_notes" does not exist',
            }),
          ],
          error: null,
        },
      });
      const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
      expect(result.data?.schemaDrift.data?.verdict).toBe('migration-held');
      expect(result.data?.identity.primaryClass).toBe('DATABASE_SCHEMA_MISMATCH');
      expect(result.data?.recentChange.state).toBe('ok');
      expect(result.data?.repairLinks.map((l) => l.target)).toContain('supabase/migrations/HELD.md');
    });
  });

  it('always offers the catalog-truth repair command, and the trace link when a trace id exists', async () => {
    stubRpcs({ helm_debug_read_db_error_events: { data: [errorRow()], error: null } });
    const result = await fetchDatabaseIncidentDetail(FINGERPRINT);
    const targets = result.data?.repairLinks.map((l) => l.target) ?? [];
    expect(targets).toContain('npm run db:drift:check');
    expect(targets).toContain('/admin/traces?trace=helm-trace-1');
  });
});
