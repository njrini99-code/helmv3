import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  errors: vi.fn(),
  performance: vi.fn(),
  platform: vi.fn(),
}));

vi.mock('../overview', () => ({ fetchDatabaseMissionControl: mocks.overview }));
vi.mock('../errors', () => ({ fetchDatabaseErrors: mocks.errors }));
vi.mock('../performance', () => ({ fetchQueryPerformance: mocks.performance }));
vi.mock('../platform', () => ({ fetchPlatformHealth: mocks.platform }));

import { fetchAlertPolicy } from '../alerts';

function errorGroup(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: 'fp',
    feature: 'round_tracking',
    service: 'postgres',
    errorCode: null,
    severity: 'critical',
    totalOccurrences: 1,
    bucketCount: 1,
    firstSeenAt: '2026-09-03T00:00:00.000Z',
    lastSeenAt: '2026-09-03T00:00:00.000Z',
    latest: { rpcName: null },
    ...overrides,
  };
}

const BLIND_ERRORS = { status: 'error', data: null, fetchedAt: null, error: 'boom' };
const UNCONFIGURED_PLATFORM = { status: 'unconfigured', data: null, fetchedAt: null, error: 'not configured' };

function okOverview(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    fetchedAt: 'now',
    data: {
      latestSample: { connectionsPctMax: 0.2 },
      history: [{}, {}, {}],
      collectors: [
        { jobType: 'db-health-sampler', lastStatus: 'completed', lastRunAt: 'now' },
        { jobType: 'db-stat-delta', lastStatus: 'completed', lastRunAt: 'now' },
      ],
      notApplied: false,
      ...overrides,
    },
  };
}

function okErrors(groups: unknown[] = []) {
  return { status: 'ok', fetchedAt: 'now', data: { groups, totalEvents: 0, criticalCount: 0, notApplied: false } };
}

function okPerformance(recentRegressions: unknown[] = []) {
  return {
    status: 'ok',
    fetchedAt: 'now',
    data: { latestSampledAt: 'now', latest: [], recentRegressions, workloadSplit: {}, notApplied: false },
  };
}

function okPlatform(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    fetchedAt: 'now',
    data: { dbUp: 1, cpuPct: 10, memoryPct: 10, sampledAt: '2026-09-03T12:00:00.000Z', ...overrides },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue(okOverview());
  mocks.errors.mockResolvedValue(okErrors());
  mocks.performance.mockResolvedValue(okPerformance());
  mocks.platform.mockResolvedValue(okPlatform());
});

describe('fetchAlertPolicy', () => {
  it('reports every rule as clear when all four readers are healthy and nothing is firing', async () => {
    const result = await fetchAlertPolicy();
    expect(result.status).toBe('ok');
    const firing = result.data!.alerts.filter((a) => a.state === 'firing');
    expect(firing).toEqual([]);
  });

  it('marks db_unavailable firing when the platform reader reports dbUp: 0', async () => {
    mocks.platform.mockResolvedValue(okPlatform({ dbUp: 0 }));
    const result = await fetchAlertPolicy();
    const row = result.data!.alerts.find((a) => a.rule.id === 'db_unavailable')!;
    expect(row.state).toBe('firing');
  });

  it('marks db_unavailable unknown (blind), never clear, when the platform reader itself fails', async () => {
    mocks.platform.mockResolvedValue({ status: 'error', data: null, fetchedAt: null, error: 'fetch failed' });
    const result = await fetchAlertPolicy();
    const row = result.data!.alerts.find((a) => a.rule.id === 'db_unavailable')!;
    expect(row.state).toBe('unknown');
  });

  it('treats an unconfigured Metrics API as clear (intentional disable), not a telemetry defect', async () => {
    mocks.platform.mockResolvedValue(UNCONFIGURED_PLATFORM);
    const result = await fetchAlertPolicy();
    const row = result.data!.alerts.find((a) => a.rule.id === 'metrics_api_unreadable')!;
    expect(row.state).toBe('clear');
  });

  it('fires metrics_api_unreadable when the platform reader genuinely failed', async () => {
    mocks.platform.mockResolvedValue({ status: 'error', data: null, fetchedAt: null, error: 'unreachable' });
    const result = await fetchAlertPolicy();
    const row = result.data!.alerts.find((a) => a.rule.id === 'metrics_api_unreadable')!;
    expect(row.state).toBe('firing');
  });

  it('fires pool_exhaustion when connectionsPctMax >= 0.9', async () => {
    mocks.overview.mockResolvedValue(okOverview({ latestSample: { connectionsPctMax: 0.95 } }));
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'pool_exhaustion')!.state).toBe('firing');
  });

  it('fires schema_mismatch on a 42P01/42703/42883 group and not otherwise', async () => {
    mocks.errors.mockResolvedValue(okErrors([errorGroup({ errorCode: '42P01' })]));
    const withCode = await fetchAlertPolicy();
    expect(withCode.data!.alerts.find((a) => a.rule.id === 'schema_mismatch')!.state).toBe('firing');

    mocks.errors.mockResolvedValue(okErrors([errorGroup({ errorCode: '23505' })]));
    const withoutCode = await fetchAlertPolicy();
    expect(withoutCode.data!.alerts.find((a) => a.rule.id === 'schema_mismatch')!.state).toBe('clear');
  });

  it('fires systematic_round_persistence_failure only for a critical group on a round-persistence RPC', async () => {
    mocks.errors.mockResolvedValue(
      okErrors([errorGroup({ severity: 'critical', latest: { rpcName: 'save_partial_round_atomic' } })]),
    );
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'systematic_round_persistence_failure')!.state).toBe('firing');
  });

  it('does not fire systematic_round_persistence_failure for a non-critical group on that RPC', async () => {
    mocks.errors.mockResolvedValue(
      okErrors([errorGroup({ severity: 'warning', latest: { rpcName: 'save_partial_round_atomic' } })]),
    );
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'systematic_round_persistence_failure')!.state).toBe('clear');
  });

  it('fires user_affecting_deadlock on any 40P01 group', async () => {
    mocks.errors.mockResolvedValue(okErrors([errorGroup({ errorCode: '40P01', severity: 'error' })]));
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'user_affecting_deadlock')!.state).toBe('firing');
  });

  it('fires sustained_critical_rpc_timeout_rate only above the occurrence threshold', async () => {
    mocks.errors.mockResolvedValue(okErrors([errorGroup({ errorCode: '57014', totalOccurrences: 2 })]));
    const below = await fetchAlertPolicy();
    expect(below.data!.alerts.find((a) => a.rule.id === 'sustained_critical_rpc_timeout_rate')!.state).toBe('clear');

    mocks.errors.mockResolvedValue(okErrors([errorGroup({ errorCode: '57014', totalOccurrences: 10 })]));
    const above = await fetchAlertPolicy();
    expect(above.data!.alerts.find((a) => a.rule.id === 'sustained_critical_rpc_timeout_rate')!.state).toBe('firing');
  });

  it('fires sampler_stopped when a collector is not completed', async () => {
    mocks.overview.mockResolvedValue(
      okOverview({ collectors: [{ jobType: 'db-health-sampler', lastStatus: 'never_run', lastRunAt: null }] }),
    );
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'sampler_stopped')!.state).toBe('firing');
  });

  it('fires performance_regression_no_failure when there are recent regressions', async () => {
    mocks.performance.mockResolvedValue(okPerformance([{ id: 1 }]));
    const result = await fetchAlertPolicy();
    expect(result.data!.alerts.find((a) => a.rule.id === 'performance_regression_no_failure')!.state).toBe('firing');
  });

  it('reports rules with no Bridge-level data source as unknown, never clear', async () => {
    const result = await fetchAlertPolicy();
    for (const id of ['critical_journey_data_loss', 'cross_tenant_rls_defect', 'mass_auth_5xx', 'sentry_blind']) {
      expect(result.data!.alerts.find((a) => a.rule.id === id)!.state).toBe('unknown');
    }
  });

  it('reports baselineStatus collecting with a short history and ready with a longer one', async () => {
    mocks.overview.mockResolvedValue(okOverview({ history: [{}] }));
    const collecting = await fetchAlertPolicy();
    expect(collecting.data!.baselineStatus).toBe('collecting');

    mocks.overview.mockResolvedValue(okOverview({ history: [{}, {}, {}, {}] }));
    const ready = await fetchAlertPolicy();
    expect(ready.data!.baselineStatus).toBe('ready');
  });

  it('always returns status ok with readerHealth reflecting each composed reader', async () => {
    mocks.errors.mockResolvedValue(BLIND_ERRORS);
    const result = await fetchAlertPolicy();
    expect(result.status).toBe('ok');
    expect(result.data!.readerHealth.errors).toBe('error');
    expect(result.data!.readerHealth.overview).toBe('ok');
  });
});
