import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc, from: mocks.from })),
}));

import { fetchDatabaseMissionControl } from '../overview';

function jobLogsQuery(rows: { job_type: string; status: string; started_at: string }[]) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue(jobLogsQuery([]));
});

describe('fetchDatabaseMissionControl', () => {
  it('returns status:unconfigured when the health-history RPC is not applied yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const result = await fetchDatabaseMissionControl();
    expect(result.status).toBe('unconfigured');
  });

  it('returns status:error on a genuine RPC failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection failure' } });
    const result = await fetchDatabaseMissionControl();
    expect(result.status).toBe('error');
  });

  it('maps the latest row and marks collectors never_run when no job logs exist', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: 2,
          sampled_at: '2026-09-03T12:05:00.000Z',
          stats_reset_at: null,
          connections_total: 22,
          connections_active: 1,
          connections_idle_in_tx: 0,
          connections_waiting_lock: 0,
          connections_pct_max: 0.3667,
          longest_active_ms: 5,
          longest_idle_in_tx_ms: 0,
          longest_lock_wait_ms: 0,
          db_size_bytes: 953_068_691,
          xact_commit_delta: 120,
          xact_rollback_delta: 5,
          deadlocks_delta: 0,
          cache_hit_ratio: 0.98,
          temp_bytes_delta: 0,
          collector_status: 'ok',
        },
      ],
      error: null,
    });

    const result = await fetchDatabaseMissionControl();
    expect(result.status).toBe('ok');
    expect(result.data!.latestSample!.connectionsTotal).toBe(22);
    expect(result.data!.latestSample!.cacheHitRatio).toBe(0.98);
    expect(result.data!.collectors).toHaveLength(3);
    expect(result.data!.collectors.every((c) => c.lastStatus === 'never_run')).toBe(true);
  });

  it('reports collector health from the most recent background_job_logs row per job type', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue(
      jobLogsQuery([
        { job_type: 'db-health-sampler', status: 'completed', started_at: '2026-09-03T12:05:00.000Z' },
        { job_type: 'db-stat-delta', status: 'failed', started_at: '2026-09-03T12:00:00.000Z' },
      ]),
    );

    const result = await fetchDatabaseMissionControl();
    const sampler = result.data!.collectors.find((c) => c.jobType === 'db-health-sampler');
    const delta = result.data!.collectors.find((c) => c.jobType === 'db-stat-delta');
    const prune = result.data!.collectors.find((c) => c.jobType === 'db-observability-prune');
    expect(sampler!.lastStatus).toBe('completed');
    expect(delta!.lastStatus).toBe('failed');
    expect(prune!.lastStatus).toBe('never_run');
  });

  it('wires the connection-saturation and rollback-rate rules (brief §19, §23) from the same history array', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: 2,
          sampled_at: '2026-09-03T12:05:00.000Z',
          stats_reset_at: null,
          connections_total: 55,
          connections_active: 1,
          connections_idle_in_tx: 0,
          connections_waiting_lock: 0,
          connections_pct_max: 0.92, // fraction, not 92 — pins the scale overview.ts feeds the rules
          longest_active_ms: 5,
          longest_idle_in_tx_ms: 0,
          longest_lock_wait_ms: 0,
          db_size_bytes: 953_068_691,
          xact_commit_delta: 120,
          xact_rollback_delta: 5,
          deadlocks_delta: 0,
          cache_hit_ratio: 0.98,
          temp_bytes_delta: 0,
          collector_status: 'ok',
        },
      ],
      error: null,
    });

    const result = await fetchDatabaseMissionControl();
    expect(result.data!.rules.connectionSaturation.level).toBe('critical');
    expect(result.data!.rules.rollbackRate.baselineStatus).toBe('collecting');
  });
});
