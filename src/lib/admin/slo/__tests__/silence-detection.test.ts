import { describe, it, expect, vi } from 'vitest';
import { computeSilenceReport } from '../silence-detection';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function featureHealth(overrides: Partial<FeatureHealth> = {}): FeatureHealth {
  return {
    key: 'round_tracking', // tier: high, heartbeatStaleHours: 6, not seasonalEmpty
    app: 'golfhelm',
    label: 'Round Tracking',
    status: 'green',
    trend: 'flat',
    reason: 'ok',
    summary: 'ok',
    topSignatures: [],
    drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: null },
    healthSignal: 'ok',
    knownGaps: [],
    ...overrides,
  };
}

describe('computeSilenceReport', () => {
  it('degraded=true reports every feature unknown, never healthy_quiet', () => {
    const report = computeSilenceReport([], true, NOW);
    expect(report.blind).toBe(true);
    expect(report.features.length).toBeGreaterThan(0);
    for (const f of report.features) expect(f.state).toBe('unknown');
  });

  it('a feature with no heartbeat table (age null) reads no_heartbeat_signal, never healthy or stale', () => {
    const report = computeSilenceReport([featureHealth({ drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: null } })], false, NOW);
    const row = report.features.find((f) => f.featureId === 'round_tracking')!;
    expect(row.state).toBe('no_heartbeat_signal');
    expect(row.thresholdHours).toBeNull();
  });

  it('an age inside the tier threshold reads healthy_quiet', () => {
    // round_tracking is 'high' tier -> heartbeatStaleHours = 6.
    const report = computeSilenceReport([featureHealth({ drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 3 } })], false, NOW);
    const row = report.features.find((f) => f.featureId === 'round_tracking')!;
    expect(row.state).toBe('healthy_quiet');
    expect(row.thresholdHours).toBe(6);
  });

  it('an age past the tier threshold reads stale — a possibly-dead emitter', () => {
    const report = computeSilenceReport([featureHealth({ drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 40 } })], false, NOW);
    const row = report.features.find((f) => f.featureId === 'round_tracking')!;
    expect(row.state).toBe('stale');
  });

  it('qualifiers uses its own 7-day override, not the med-tier 72h default', () => {
    // qualifiers: tier 'med' (default 72h) but heartbeatStaleHoursOverride = 24*7 = 168h.
    const report = computeSilenceReport(
      [featureHealth({ key: 'qualifiers', drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 100 } })],
      false,
      NOW,
    );
    const row = report.features.find((f) => f.featureId === 'qualifiers')!;
    expect(row.thresholdHours).toBe(24 * 7);
    expect(row.state).toBe('healthy_quiet'); // 100h < 168h, though it would exceed the med-tier default of 72h
  });

  it('a seasonalEmpty feature past its threshold still reads healthy_quiet, never stale', async () => {
    // The one live seasonalEmpty:true registry entry (`integrations`) has
    // heartbeatTable: null, so its heartbeatAgeHours is always null and it
    // can only ever hit the earlier no_heartbeat_signal branch — this
    // branch (seasonalEmpty WITH a real age) is real, deliberate defensive
    // code for a shape the current registry does not happen to contain, so
    // it is exercised here against a synthetic registry entry rather than
    // left untested because no live key currently reaches it.
    vi.resetModules();
    vi.doMock('@/lib/admin/feature-registry', async () => {
      const actual = await vi.importActual<typeof import('@/lib/admin/feature-registry')>('@/lib/admin/feature-registry');
      return {
        ...actual,
        FEATURE_REGISTRY: [
          ...actual.FEATURE_REGISTRY,
          { key: 'synthetic_seasonal', label: 'Synthetic Seasonal', app: 'golfhelm', actions: {}, primaryTable: null, heartbeatTable: 'x', tier: 'high', seasonalEmpty: true, healthSignal: 'n/a' },
        ],
      };
    });
    const { computeSilenceReport: computeSilenceReportMocked } = await import('../silence-detection');

    const report = computeSilenceReportMocked(
      [
        {
          key: 'synthetic_seasonal' as never,
          app: 'golfhelm',
          label: 'Synthetic Seasonal',
          status: 'green',
          trend: 'flat',
          reason: 'ok',
          summary: 'ok',
          topSignatures: [],
          drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 400 }, // far past high-tier's 6h default
          healthSignal: 'ok',
          knownGaps: [],
        },
      ],
      false,
      NOW,
    );
    // 'synthetic_seasonal' is not a real FeatureKey — it exists only inside
    // the mocked registry module above, so the comparison needs a cast the
    // same way the mocked fixture's own `key` field does.
    const row = report.features.find((f) => (f.featureId as string) === 'synthetic_seasonal')!;
    expect(row.state).toBe('healthy_quiet');
    expect(row.reason).toContain('seasonalEmpty');
  });

  it('excludes the crm_recruiting_pipeline feature from a degraded report, same as error-budget', () => {
    const report = computeSilenceReport([], true, NOW);
    expect(report.features.some((f) => f.featureId === 'crm_recruiting_pipeline')).toBe(false);
  });
});
