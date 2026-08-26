import { describe, it, expect } from 'vitest';
import {
  computeFeatureStatus,
  summarizeFeatureHealth,
  computeFeatureHealthBanner,
  type FeatureHealthInputs,
  type FeatureHealth,
} from '@/lib/admin/data/feature-health';

const NOW = new Date('2026-07-02T12:00:00Z');

function iso(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
}

/** A fully "instrumented, healthy, has activity" baseline — every test
 *  overrides only the fields relevant to what it's proving, so an
 *  unrelated field can never accidentally trip the neutral-first gate. */
function baseInputs(overrides: Partial<FeatureHealthInputs> = {}): FeatureHealthInputs {
  return {
    key: 'round_tracking',
    tier: 'high',
    seasonalEmpty: false,
    neverNeutral: false,
    events24h: {
      total: 10,
      errors: 0,
      criticalUnresolved: 0,
      warnings: 10,
      fingerprints: 0,
      rlsDenials: 0,
      rlsDenialFingerprints: 0,
      rlsDenialUsers: 0,
    },
    fingerprintsPrev24h: 0,
    errorsPrev24h: 0,
    fingerprints7d: 0,
    integrityStatus: null,
    heartbeatLastActivity: iso(1),
    sentryUnresolved: { total: 0, critical: 0 },
    primaryTableWrites7d: 100,
    heartbeatStaleHoursOverride: null,
    now: NOW,
    ...overrides,
  };
}

describe('computeFeatureStatus — neutral-first (§3.1)', () => {
  it('seasonalEmpty + zero activity → neutral even with a stale heartbeat', () => {
    const result = computeFeatureStatus(
      baseInputs({
        seasonalEmpty: true,
        events24h: {
          total: 0, errors: 0, criticalUnresolved: 0, warnings: 0,
          fingerprints: 0, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0,
        },
        heartbeatLastActivity: iso(1000), // very stale — must NOT flip this to amber
      }),
    );
    expect(result.status).toBe('neutral');
  });

  it('no feature-tagged data anywhere (not-yet-instrumented) → neutral, even with a FRESH heartbeat on the raw table', () => {
    // This is the real current-state scenario: the underlying table (e.g.
    // golf_rounds) is actively written by untagged code, so heartbeat is
    // recent, but zero admin_events rows carry this feature tag yet.
    const result = computeFeatureStatus(
      baseInputs({
        events24h: {
          total: 0, errors: 0, criticalUnresolved: 0, warnings: 0,
          fingerprints: 0, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0,
        },
        heartbeatLastActivity: iso(0.1), // fresh — must NOT be read as "healthy" fake-green
      }),
    );
    expect(result.status).toBe('neutral');
    expect(result.reason).toMatch(/not yet reporting/i);
  });

  it('neverNeutral (admin_dashboard) with zero everything → green, not neutral', () => {
    const result = computeFeatureStatus(
      baseInputs({
        neverNeutral: true,
        events24h: {
          total: 0, errors: 0, criticalUnresolved: 0, warnings: 0,
          fingerprints: 0, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0,
        },
        heartbeatLastActivity: null,
      }),
    );
    expect(result.status).toBe('green');
  });
});

describe('computeFeatureStatus — hysteresis RED (§3.2, N5)', () => {
  it('high tier: fingerprints=6 & prev=1 → amber (a single hot window never reds)', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 6, errors: 6, criticalUnresolved: 0, warnings: 0, fingerprints: 6, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0 },
        fingerprintsPrev24h: 1,
      }),
    );
    expect(result.status).toBe('amber');
  });

  it('high tier: fingerprints=6 & prev=5 → red (both windows cross the RED line)', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 6, errors: 6, criticalUnresolved: 0, warnings: 0, fingerprints: 6, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0 },
        fingerprintsPrev24h: 5,
      }),
    );
    expect(result.status).toBe('red');
  });

  it('leaving red: previous window hot, current window clean → steps down (no flap)', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 10, errors: 0, criticalUnresolved: 0, warnings: 10, fingerprints: 0, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0 },
        fingerprintsPrev24h: 6,
      }),
    );
    expect(result.status).toBe('green');
  });
});

describe('computeFeatureStatus — critical overrides (§3.2)', () => {
  it('criticalUnresolved=1 reds immediately at high tier', () => {
    const result = computeFeatureStatus(baseInputs({ tier: 'high', events24h: { ...baseInputs().events24h, criticalUnresolved: 1 } }));
    expect(result.status).toBe('red');
  });

  it('low-tier single critical reds immediately — no 2-window grace', () => {
    const result = computeFeatureStatus(
      baseInputs({ tier: 'low', events24h: { ...baseInputs().events24h, criticalUnresolved: 1 } }),
    );
    expect(result.status).toBe('red');
  });
});

describe('computeFeatureStatus — integrity override', () => {
  it("integrityStatus='fail' → red regardless of fingerprint math", () => {
    const result = computeFeatureStatus(baseInputs({ integrityStatus: 'fail' }));
    expect(result.status).toBe('red');
  });
});

describe('computeFeatureStatus — warnings never drive a dot (N3)', () => {
  it('warnings=500, fingerprints=0 → green', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 500, errors: 0, criticalUnresolved: 0, warnings: 500, fingerprints: 0, rlsDenials: 0, rlsDenialFingerprints: 0, rlsDenialUsers: 0 },
      }),
    );
    expect(result.status).toBe('green');
  });
});

describe('computeFeatureStatus — RLS-denial cluster (§0 special case)', () => {
  it('same-fingerprint flood (12 denials, 1 fingerprint, ≥3 users) → amber, first window', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 12, errors: 0, criticalUnresolved: 0, warnings: 0, fingerprints: 0, rlsDenials: 12, rlsDenialFingerprints: 1, rlsDenialUsers: 3 },
      }),
    );
    expect(result.status).toBe('amber');
  });

  it('a sustained-looking cluster still caps at amber — no un-evidenced escalation to red', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 200, errors: 0, criticalUnresolved: 0, warnings: 0, fingerprints: 0, rlsDenials: 200, rlsDenialFingerprints: 1, rlsDenialUsers: 50 },
      }),
    );
    expect(result.status).toBe('amber');
  });

  it('a one-off denial (below cluster threshold) does not amber', () => {
    const result = computeFeatureStatus(
      baseInputs({
        events24h: { total: 1, errors: 0, criticalUnresolved: 0, warnings: 0, fingerprints: 0, rlsDenials: 1, rlsDenialFingerprints: 1, rlsDenialUsers: 1 },
      }),
    );
    expect(result.status).toBe('green');
  });
});

describe('computeFeatureStatus — low-traffic tier judged on fingerprints7d (§3.3)', () => {
  it('fingerprints7d=1 → amber (not evaluated against 24h raw counts)', () => {
    const result = computeFeatureStatus(baseInputs({ tier: 'low', fingerprints7d: 1 }));
    expect(result.status).toBe('amber');
  });

  it('fingerprints7d=2 → red-eligible (crosses the low-tier RED line)', () => {
    const result = computeFeatureStatus(baseInputs({ tier: 'low', fingerprints7d: 2 }));
    expect(result.status).toBe('red');
  });
});

describe('computeFeatureStatus — heartbeat staleness (§3.3)', () => {
  it('med tier, zero errors, heartbeat 100h stale, primary table set → amber', () => {
    const result = computeFeatureStatus(
      baseInputs({ tier: 'med', heartbeatLastActivity: iso(100) }),
    );
    expect(result.status).toBe('amber');
  });

  it('same but no heartbeat data (no primary table / empty table) → green — staleness cannot amber a heartbeat-less feature', () => {
    const result = computeFeatureStatus(
      baseInputs({ tier: 'med', heartbeatLastActivity: null }),
    );
    expect(result.status).toBe('green');
  });

  it("qualifiers' widened 7d heartbeat window is honored via the per-feature override", () => {
    const result = computeFeatureStatus(
      baseInputs({
        key: 'qualifiers',
        tier: 'med',
        heartbeatLastActivity: iso(100), // stale for the 72h med default...
        heartbeatStaleHoursOverride: 24 * 7, // ...but within the widened 7d window
      }),
    );
    expect(result.status).toBe('green');
  });
});

describe('computeFeatureStatus — trend badge', () => {
  it('prev=0, now>0 → worsening', () => {
    const result = computeFeatureStatus(baseInputs({ errorsPrev24h: 0, events24h: { ...baseInputs().events24h, errors: 3 } }));
    expect(result.trend).toBe('worsening');
  });
  it('both 0 → flat (NaN-safe)', () => {
    const result = computeFeatureStatus(baseInputs({ errorsPrev24h: 0, events24h: { ...baseInputs().events24h, errors: 0 } }));
    expect(result.trend).toBe('flat');
  });
  it('>20% down → improving', () => {
    const result = computeFeatureStatus(baseInputs({ errorsPrev24h: 10, events24h: { ...baseInputs().events24h, errors: 5 } }));
    expect(result.trend).toBe('improving');
  });
  it('>20% up → worsening', () => {
    const result = computeFeatureStatus(baseInputs({ errorsPrev24h: 10, events24h: { ...baseInputs().events24h, errors: 15 } }));
    expect(result.trend).toBe('worsening');
  });
  it('within ±20% → flat', () => {
    const result = computeFeatureStatus(baseInputs({ errorsPrev24h: 10, events24h: { ...baseInputs().events24h, errors: 11 } }));
    expect(result.trend).toBe('flat');
  });
});

describe('computeFeatureStatus — Sentry degrade', () => {
  it('sentryUnresolved=null → status computed from DB only, reason notes Sentry unavailable', () => {
    const result = computeFeatureStatus(baseInputs({ sentryUnresolved: null }));
    expect(result.status).toBe('green');
    expect(result.reason).toMatch(/Sentry unavailable/i);
  });

  it('an unresolved non-critical Sentry issue ambers a DB-quiet feature', () => {
    const result = computeFeatureStatus(baseInputs({ sentryUnresolved: { total: 2, critical: 0 } }));
    expect(result.status).toBe('amber');
  });
});

// ---------------------------------------------------------------------------
// Overview rollup — pure banner-discipline functions (N6)
// ---------------------------------------------------------------------------

function fh(overrides: Partial<FeatureHealth> = {}): FeatureHealth {
  return {
    key: 'round_tracking',
    app: 'golfhelm',
    label: 'Round Tracking',
    status: 'green',
    trend: 'flat',
    reason: 'ok',
    summary: 'ok',
    topSignatures: [],
    drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 1 },
    healthSignal: 'ok',
    knownGaps: [],
    ...overrides,
  };
}

describe('summarizeFeatureHealth + computeFeatureHealthBanner — banner discipline (N6)', () => {
  it('0 red + any number of warnings-only features → contributes NOTHING to the banner', () => {
    const features = [fh({ key: 'round_tracking', status: 'green' }), fh({ key: 'stats_analytics', status: 'amber' })];
    const summary = summarizeFeatureHealth({ features, generatedAt: NOW.toISOString(), degraded: false }, NOW);
    const banner = computeFeatureHealthBanner(summary);
    expect(banner.contributes).toBe(false);
    expect(banner.line).toBeNull();
  });

  it('≥1 red feature → surfaces exactly one banner line', () => {
    const features = [fh({ key: 'round_tracking', status: 'red', label: 'Round Tracking' })];
    const summary = summarizeFeatureHealth({ features, generatedAt: NOW.toISOString(), degraded: false }, NOW);
    const banner = computeFeatureHealthBanner(summary);
    expect(banner.contributes).toBe(true);
    expect(banner.line).toContain('Round Tracking');
    expect(banner.line?.split('\n').length).toBe(1);
  });

  it('a new-in-24h fingerprint on a previously-clean (non-red) feature surfaces one banner line', () => {
    const features = [
      fh({
        key: 'stats_analytics',
        status: 'amber',
        topSignatures: [
          { fingerprint: 'abc', title: 'boom', count: 3, firstSeen: iso(2), lastSeen: iso(0.5), severity: 'error' },
        ],
      }),
    ];
    const summary = summarizeFeatureHealth({ features, generatedAt: NOW.toISOString(), degraded: false }, NOW);
    expect(summary.newFingerprints24h).toBe(1);
    const banner = computeFeatureHealthBanner(summary);
    expect(banner.contributes).toBe(true);
  });

  it('a degraded pipeline always surfaces exactly one banner line', () => {
    const summary = summarizeFeatureHealth({ features: [], generatedAt: NOW.toISOString(), degraded: true }, NOW);
    const banner = computeFeatureHealthBanner(summary);
    expect(banner.contributes).toBe(true);
    expect(banner.line).toMatch(/degraded/i);
  });

  it('all-green tallies counts correctly for the quiet single-line rollup', () => {
    const features = [fh({ status: 'green' }), fh({ status: 'green', key: 'stats_analytics' }), fh({ status: 'neutral', key: 'qualifiers' })];
    const summary = summarizeFeatureHealth({ features, generatedAt: NOW.toISOString(), degraded: false }, NOW);
    expect(summary).toMatchObject({ green: 2, amber: 0, red: 0, neutral: 1 });
    expect(computeFeatureHealthBanner(summary).contributes).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Health-consolidation pinning test (rendering-only change) — FeatureDotGrid
// and FeatureHealthRollup were unified behind one FeatureHealthSummary
// component in this pass, and the classifier itself was NOT touched. This
// pins the full { status, trend, reason } output of computeFeatureStatus
// across one representative input per branch, so a rendering-layer refactor
// can never silently carry a status-logic change with it.
// ---------------------------------------------------------------------------
describe('computeFeatureStatus — pinned outputs (health-consolidation regression guard)', () => {
  it('matches the exact status/trend/reason for one representative input per classifier branch', () => {
    const cases: Array<{ name: string; inputs: FeatureHealthInputs }> = [
      { name: 'neutral — no feature-tagged data', inputs: baseInputs({ events24h: { ...baseInputs().events24h, total: 0, warnings: 0 }, heartbeatLastActivity: null, sentryUnresolved: null }) },
      { name: 'red — unresolved critical', inputs: baseInputs({ events24h: { ...baseInputs().events24h, criticalUnresolved: 1 } }) },
      { name: 'red — integrity check failed', inputs: baseInputs({ integrityStatus: 'fail' }) },
      {
        name: 'red — hysteresis across 2 windows (high tier)',
        inputs: baseInputs({ tier: 'high', events24h: { ...baseInputs().events24h, fingerprints: 20 }, fingerprintsPrev24h: 20 }),
      },
      { name: 'red — low-tier trailing-7d line', inputs: baseInputs({ tier: 'low', fingerprints7d: 2 }) },
      {
        name: 'amber — RLS-denial cluster (many users)',
        inputs: baseInputs({ events24h: { ...baseInputs().events24h, rlsDenials: 3, rlsDenialUsers: 3 } }),
      },
      { name: 'amber — fingerprint at threshold', inputs: baseInputs({ tier: 'high', events24h: { ...baseInputs().events24h, fingerprints: 5 } }) },
      { name: 'amber — unresolved non-critical Sentry issue', inputs: baseInputs({ sentryUnresolved: { total: 2, critical: 0 } }) },
      { name: 'amber — stale heartbeat', inputs: baseInputs({ heartbeatLastActivity: iso(200) }) },
      { name: 'green — healthy baseline', inputs: baseInputs() },
    ];

    const pinned = cases.map(({ name, inputs }) => ({ name, result: computeFeatureStatus(inputs) }));

    expect(pinned).toMatchInlineSnapshot(`
      [
        {
          "name": "neutral — no feature-tagged data",
          "result": {
            "reason": "No feature-tagged data yet — instrumentation not yet reporting for this feature. Sentry unavailable — status computed from DB signals only.",
            "status": "neutral",
            "trend": "flat",
          },
        },
        {
          "name": "red — unresolved critical",
          "result": {
            "reason": "1 unresolved critical incident(s) in the last 24h.",
            "status": "red",
            "trend": "flat",
          },
        },
        {
          "name": "red — integrity check failed",
          "result": {
            "reason": "Latest integrity check failed for this feature.",
            "status": "red",
            "trend": "flat",
          },
        },
        {
          "name": "red — hysteresis across 2 windows (high tier)",
          "result": {
            "reason": "Error-fingerprint rate at/above 5/24h across 2 consecutive windows (current 20, previous 20).",
            "status": "red",
            "trend": "flat",
          },
        },
        {
          "name": "red — low-tier trailing-7d line",
          "result": {
            "reason": "2 error fingerprint(s) in the trailing 7 days (low-traffic RED line 2).",
            "status": "red",
            "trend": "flat",
          },
        },
        {
          "name": "amber — RLS-denial cluster (many users)",
          "result": {
            "reason": "RLS-denial cluster: 3 denial(s) across 3 user(s) in 24h — possible missing grant / unapplied migration.",
            "status": "amber",
            "trend": "flat",
          },
        },
        {
          "name": "amber — fingerprint at threshold",
          "result": {
            "reason": "5 error fingerprint(s) in the last 24h.",
            "status": "amber",
            "trend": "flat",
          },
        },
        {
          "name": "amber — unresolved non-critical Sentry issue",
          "result": {
            "reason": "2 unresolved non-critical Sentry issue(s) tagged to this feature.",
            "status": "amber",
            "trend": "flat",
          },
        },
        {
          "name": "amber — stale heartbeat",
          "result": {
            "reason": "Heartbeat stale — last activity 200h ago (threshold 6h).",
            "status": "amber",
            "trend": "flat",
          },
        },
        {
          "name": "green — healthy baseline",
          "result": {
            "reason": "Healthy — no error fingerprints, no RLS cluster, heartbeat within threshold.",
            "status": "green",
            "trend": "flat",
          },
        },
      ]
    `);
  });
});
