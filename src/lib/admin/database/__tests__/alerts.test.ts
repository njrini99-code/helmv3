import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  errors: vi.fn(),
  performance: vi.fn(),
  platform: vi.fn(),
  platformHistory: vi.fn(),
}));

vi.mock('../overview', () => ({ fetchDatabaseMissionControl: mocks.overview }));
vi.mock('../errors', () => ({ fetchDatabaseErrors: mocks.errors }));
vi.mock('../performance', () => ({ fetchQueryPerformance: mocks.performance }));
vi.mock('../platform', () => ({ fetchPlatformHealth: mocks.platform, fetchPlatformHistory: mocks.platformHistory }));

import { fetchAlertPolicy } from '../alerts';

/** Two stored samples, which is the minimum `evaluatePlatformRules` needs
 *  before a "sustained" rule can be judged at all. Tests that care about the
 *  not-enough-history path override this. */
function okPlatformHistory(samples: Array<Record<string, unknown>> = [
  { sampledAt: '2026-09-03T11:50:00.000Z', dbUp: 1, cpuPct: 10, memoryPct: 20 },
  { sampledAt: '2026-09-03T11:55:00.000Z', dbUp: 1, cpuPct: 11, memoryPct: 21 },
]) {
  return { status: 'ok', data: samples, fetchedAt: '2026-09-03T12:00:00.000Z' };
}


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
  mocks.platformHistory.mockResolvedValue(okPlatformHistory());
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

  // The three collector states are not interchangeable. This used to be one
  // test named "when a collector is not completed", which is the defect
  // written down as a specification: it made `unknown` — a job-log read that
  // never returned — fire a defect claiming a collector stopped.
  const samplerState = async () =>
    (await fetchAlertPolicy()).data!.alerts.find((a) => a.rule.id === 'sampler_stopped')!;

  it('fires sampler_stopped when a collector FAILED', async () => {
    mocks.overview.mockResolvedValue(
      okOverview({ collectors: [{ jobType: 'db-health-sampler', lastStatus: 'failed', lastRunAt: null }] }),
    );
    expect((await samplerState()).state).toBe('firing');
  });

  it('fires sampler_stopped when a collector has NEVER RUN', async () => {
    // Deliberately still firing. A registered, deployed cron with no run row
    // is how a permanently dead one looks (#1775), and routing this to
    // `unknown` would silence the only signal that catches it.
    mocks.overview.mockResolvedValue(
      okOverview({ collectors: [{ jobType: 'db-health-sampler', lastStatus: 'never_run', lastRunAt: null }] }),
    );
    expect((await samplerState()).state).toBe('firing');
  });

  it('reports UNKNOWN, never firing, when the collector job-log read failed', async () => {
    // overview.ts returns 'unknown' for ALL collectors when the read fails,
    // so this is the whole-panel case, not an edge one.
    mocks.overview.mockResolvedValue(
      okOverview({
        collectors: [
          { jobType: 'db-health-sampler', lastStatus: 'unknown', lastRunAt: null },
          { jobType: 'db-stat-delta', lastStatus: 'unknown', lastRunAt: null },
        ],
      }),
    );
    const alert = await samplerState();
    // Not 'clear' either — that would be the worst of the three, reporting
    // healthy collectors from a query that never returned.
    expect(alert.state).toBe('unknown');
    expect(alert.reason).toMatch(/did not return/);
  });

  it('a known failure outranks an unreadable collector', async () => {
    mocks.overview.mockResolvedValue(
      okOverview({
        collectors: [
          { jobType: 'db-health-sampler', lastStatus: 'unknown', lastRunAt: null },
          { jobType: 'db-stat-delta', lastStatus: 'failed', lastRunAt: null },
        ],
      }),
    );
    const alert = await samplerState();
    expect(alert.state).toBe('firing');
    expect(alert.evidence).toContain('db-stat-delta: failed');
    // The unreadable one must not be presented as a defect it was never
    // observed to have.
    expect(alert.evidence).not.toContain('db-health-sampler');
  });

  it('is clear only when every collector actually completed', async () => {
    mocks.overview.mockResolvedValue(
      okOverview({ collectors: [{ jobType: 'db-health-sampler', lastStatus: 'completed', lastRunAt: null }] }),
    );
    expect((await samplerState()).state).toBe('clear');
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

  it('reports db_unavailable as UNKNOWN, never clear, when the scrape carried no database-up metric', async () => {
    // The metric allow-list is docs-derived and not live-verified, so an
    // absent pg_up is expected. Mapping null through `=== 0` would render a
    // P0 "Database unavailable" as CLEAR over a metric nobody read.
    mocks.platform.mockResolvedValue(okPlatform({ dbUp: null }));
    const result = await fetchAlertPolicy();
    const rule = result.data!.alerts.find((a) => a.rule.id === 'db_unavailable');
    expect(rule).toBeDefined();
    expect(rule!.state).not.toBe('clear');
    expect(rule!.state).toBe('unknown');
  });

  it('reports sustained_resource_saturation as UNKNOWN when the stored history cannot support a sustained judgement', async () => {
    // One live reading can never satisfy "sustained", so evaluating it and
    // reporting clear would be a green over a rule that never ran.
    mocks.platformHistory.mockResolvedValue({ status: 'unconfigured', data: null, fetchedAt: null, error: 'migration HELD' });
    const result = await fetchAlertPolicy();
    const rule = result.data!.alerts.find((a) => a.rule.id === 'sustained_resource_saturation');
    expect(rule).toBeDefined();
    expect(rule!.state).not.toBe('clear');
    expect(rule!.state).toBe('unknown');
  });
});
