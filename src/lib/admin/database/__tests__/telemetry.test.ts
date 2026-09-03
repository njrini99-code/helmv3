import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchDatabaseMissionControl: vi.fn(),
  fetchCollectorHealth: vi.fn(),
  fetchDatabaseErrors: vi.fn(),
  fetchQueryPerformance: vi.fn(),
  fetchTableHealth: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

vi.mock('../overview', () => ({
  fetchDatabaseMissionControl: mocks.fetchDatabaseMissionControl,
  fetchCollectorHealth: mocks.fetchCollectorHealth,
}));

vi.mock('../errors', () => ({
  fetchDatabaseErrors: mocks.fetchDatabaseErrors,
}));

vi.mock('../performance', () => ({
  fetchQueryPerformance: mocks.fetchQueryPerformance,
}));

vi.mock('../tables', () => ({
  fetchTableHealth: mocks.fetchTableHealth,
}));

import { fetchTelemetryHealth } from '../telemetry';

const NOW_ISO = '2026-09-03T12:00:00.000Z';

function okResult<T>(data: T) {
  return { status: 'ok' as const, data, fetchedAt: NOW_ISO };
}

function errorResult() {
  return { status: 'error' as const, data: null, fetchedAt: null, error: 'boom' };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));

  mocks.fetchDatabaseMissionControl.mockResolvedValue(
    okResult({ latestSample: { sampledAt: NOW_ISO }, history: [], collectors: [], rules: {}, notApplied: false }),
  );
  mocks.fetchCollectorHealth.mockResolvedValue([
    { jobType: 'db-health-sampler', lastStatus: 'completed', lastRunAt: NOW_ISO },
  ]);
  mocks.fetchDatabaseErrors.mockResolvedValue(okResult({ groups: [], totalEvents: 0, criticalCount: 0, notApplied: false }));
  mocks.fetchQueryPerformance.mockResolvedValue(
    okResult({ latestSampledAt: NOW_ISO, latest: [], recentRegressions: [], workloadSplit: {}, notApplied: false }),
  );
  mocks.fetchTableHealth.mockResolvedValue(okResult({ latestSampledAt: NOW_ISO, tables: [], warnings: [], notApplied: false }));
  mocks.rpc.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchTelemetryHealth', () => {
  it('returns overall:green when every required source is fresh, including a recently-seen error-store row', async () => {
    // The default beforeEach setup leaves db_error_events with zero groups,
    // which is deliberately 'unknown' (see the dedicated test below) — this
    // test supplies a fresh occurrence so the true "everything is healthy"
    // path is also exercised.
    mocks.fetchDatabaseErrors.mockResolvedValue(
      okResult({
        groups: [
          {
            fingerprint: 'x',
            feature: 'y',
            service: 'postgres',
            errorCode: null,
            severity: 'warning',
            totalOccurrences: 1,
            bucketCount: 1,
            firstSeenAt: NOW_ISO,
            lastSeenAt: NOW_ISO,
            latest: {},
          },
        ],
        totalEvents: 1,
        criticalCount: 0,
        notApplied: false,
      }),
    );
    const result = await fetchTelemetryHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.overall).toBe('green');
  });

  it('is never green when the health sampler source read as error (blind)', async () => {
    mocks.fetchDatabaseMissionControl.mockResolvedValue(errorResult());
    const result = await fetchTelemetryHealth();
    expect(result.data!.overall).not.toBe('green');
    expect(result.data!.sources.find((s) => s.name === 'db_health_samples')?.state).toBe('blind');
  });

  it('does NOT treat an empty error store as healthy — it reads unknown, not green', async () => {
    mocks.fetchDatabaseErrors.mockResolvedValue(okResult({ groups: [], totalEvents: 0, criticalCount: 0, notApplied: false }));
    const result = await fetchTelemetryHealth();
    const errorSource = result.data!.sources.find((s) => s.name === 'db_error_events');
    expect(errorSource?.state).toBe('unknown');
    expect(result.data!.overall).not.toBe('green');
  });

  it('degrades to unavailable table sizes on a sizes RPC failure without failing the whole snapshot', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'not found' } });
    const result = await fetchTelemetryHealth();
    expect(result.status).toBe('ok');
    expect(result.data!.sizesCapability).toBe('unavailable');
    expect(result.data!.tableSizes).toEqual([]);
  });

  it('maps table sizes from the sizes RPC when available', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ table_name: 'db_health_samples', total_bytes: 1024, row_count: 10, rows_last_24h: 5 }],
      error: null,
    });
    const result = await fetchTelemetryHealth();
    expect(result.data!.sizesCapability).toBe('available');
    expect(result.data!.tableSizes).toEqual([
      { tableName: 'db_health_samples', totalBytes: 1024, rowCount: 10, rowsLast24h: 5 },
    ]);
  });

  it('never throws — an unexpected composed-reader rejection is caught and reported as status:error', async () => {
    mocks.fetchQueryPerformance.mockRejectedValue(new Error('unexpected'));
    const result = await fetchTelemetryHealth();
    expect(result.status).toBe('error');
  });
});
