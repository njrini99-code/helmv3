import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Fetcher-level tests (bottom of this file) mock both collaborators the way
// feature-health.test.ts already mocks `@/lib/supabase/server` — a chainable
// query-builder stub for the admin client, and a canned fetchFeatureHealth()
// result so this file never has to stand up the real RPC/Sentry chain.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  fetchFeatureHealth: vi.fn(),
}));
vi.mock('@/lib/admin/data/feature-health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/data/feature-health')>();
  return { ...actual, fetchFeatureHealth: mocks.fetchFeatureHealth };
});

/** A minimal chainable stub matching supabase-js's query-builder shape:
 *  every method returns the same object until it is awaited, at which point
 *  `.then` resolves to whatever canned result this call was assigned. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/** `admin.from('admin_events')` is called exactly 5 times per
 *  `loadCoverageAndRawEvents` call, in this fixed order: raw rows, total
 *  count, unattributed count, unattributed errors, unattributed warnings.
 *  Tests hand this function results in that order. */
function mockAdminClient(results: unknown[]) {
  let call = 0;
  return { from: () => makeChain(results[call++]) };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import {
  classifyRecency,
  classifyUnregisteredStatus,
  aggregateFeatureEvents,
  computeAttributionCoverage,
  compareFeatureDetailRows,
  rankFeatureDetailRows,
  fetchFeatureHealthDetail,
  type FeatureDetailRankable,
  type RawFeatureEventRow,
} from '@/lib/admin/data/feature-health-detail';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';

const NOW = new Date('2026-08-27T12:00:00Z');

function hoursAgoIso(hours: number, from: Date = NOW): string {
  return new Date(from.getTime() - hours * 3_600_000).toISOString();
}

describe('classifyRecency', () => {
  it('null lastEventAt → no_activity, distinct from an old timestamp', () => {
    expect(classifyRecency(null, NOW)).toBe('no_activity');
  });

  it('within 24h → active', () => {
    expect(classifyRecency(hoursAgoIso(1), NOW)).toBe('active');
    expect(classifyRecency(hoursAgoIso(24), NOW)).toBe('active');
  });

  it('between 24h and 72h → recent', () => {
    expect(classifyRecency(hoursAgoIso(25), NOW)).toBe('recent');
    expect(classifyRecency(hoursAgoIso(72), NOW)).toBe('recent');
  });

  it('beyond 72h → stale (the "integrations" scenario: last event 3 days before "now")', () => {
    expect(classifyRecency(hoursAgoIso(73), NOW)).toBe('stale');
    // The task's exact snapshot: last event 2026-08-24, measured 2026-08-27 — a
    // little over 3 days.
    expect(classifyRecency('2026-08-24T00:00:00Z', NOW)).toBe('stale');
  });

  it('an unparsable timestamp is treated as no_activity, never as "just happened"', () => {
    expect(classifyRecency('not-a-date', NOW)).toBe('no_activity');
  });

  it('a future timestamp (clock skew) reads as active, never stale — over-alert, not under', () => {
    expect(classifyRecency(hoursAgoIso(-5), NOW)).toBe('active');
  });
});

describe('aggregateFeatureEvents', () => {
  const row = (over: Partial<RawFeatureEventRow>): RawFeatureEventRow => ({
    id: 'e1',
    feature: 'round_tracking',
    severity: 'error',
    title: 'save failed',
    created_at: hoursAgoIso(1),
    fingerprint: 'fp-1',
    ...over,
  });

  it('groups by the raw feature string, including a distinct null bucket for untagged rows', () => {
    const agg = aggregateFeatureEvents([
      row({ feature: 'round_tracking' }),
      row({ feature: null, id: 'e2', fingerprint: null }),
    ]);
    expect(agg.has('round_tracking')).toBe(true);
    expect(agg.has(null)).toBe(true);
    expect(agg.get('round_tracking')!.counts.total).toBe(1);
    expect(agg.get(null)!.counts.total).toBe(1);
  });

  it('counts critical+error as errors, warning as warnings, and info as neither — but info still counts toward total', () => {
    const agg = aggregateFeatureEvents([
      row({ id: 'e1', severity: 'critical' }),
      row({ id: 'e2', severity: 'error' }),
      row({ id: 'e3', severity: 'warning' }),
      row({ id: 'e4', severity: 'info' }),
    ]);
    const bucket = agg.get('round_tracking')!;
    expect(bucket.counts).toEqual({ errors: 2, warnings: 1, total: 4 });
  });

  it('lastEventAt is the max created_at seen for that tag, regardless of row order', () => {
    const agg = aggregateFeatureEvents([
      row({ id: 'e1', created_at: hoursAgoIso(50) }),
      row({ id: 'e2', created_at: hoursAgoIso(2) }),
      row({ id: 'e3', created_at: hoursAgoIso(20) }),
    ]);
    expect(agg.get('round_tracking')!.lastEventAt).toBe(hoursAgoIso(2));
  });

  it('a row with no created_at is excluded entirely rather than guessed into the window', () => {
    const agg = aggregateFeatureEvents([row({ id: 'e1', created_at: null })]);
    expect(agg.has('round_tracking')).toBe(false);
  });

  it('top signatures group by fingerprint (falling back to row:<id> when absent), rank by count desc, cap at 3, and exclude info', () => {
    const rows: RawFeatureEventRow[] = [
      row({ id: 'e1', fingerprint: 'fp-a', severity: 'error', title: 'A', created_at: hoursAgoIso(5) }),
      row({ id: 'e2', fingerprint: 'fp-a', severity: 'error', title: 'A', created_at: hoursAgoIso(1) }),
      row({ id: 'e3', fingerprint: 'fp-b', severity: 'warning', title: 'B', created_at: hoursAgoIso(2) }),
      row({ id: 'e4', fingerprint: null, severity: 'error', title: 'C', created_at: hoursAgoIso(3) }),
      row({ id: 'e5', fingerprint: 'fp-d', severity: 'info', title: 'D (routine)', created_at: hoursAgoIso(1) }),
    ];
    const bucket = aggregateFeatureEvents(rows).get('round_tracking')!;
    expect(bucket.topSignatures).toHaveLength(3); // A, B, C — D (info) excluded
    expect(bucket.topSignatures[0]).toMatchObject({ fingerprint: 'fp-a', count: 2, title: 'A' });
    expect(bucket.topSignatures.find((s) => s.fingerprint === 'row:e4')).toMatchObject({ title: 'C' });
    expect(bucket.topSignatures.some((s) => s.title === 'D (routine)')).toBe(false);
    // fp-a's firstSeen/lastSeen span both its occurrences.
    expect(bucket.topSignatures[0]!.firstSeen).toBe(hoursAgoIso(5));
    expect(bucket.topSignatures[0]!.lastSeen).toBe(hoursAgoIso(1));
  });
});

describe('computeAttributionCoverage', () => {
  it('matches the task\'s real production shape: 539 unattributed of a larger 7d total', () => {
    const coverage = computeAttributionCoverage({
      totalEvents: 2110,
      unattributedEvents: 539,
      unattributedErrors: 11,
      unattributedWarnings: 11,
      windowDays: 7,
    });
    expect(coverage.attributedEvents).toBe(1571);
    expect(coverage.coveragePct).toBeCloseTo(74.5, 1);
    expect(coverage.confidence).toBe('medium'); // 70–90% band
    expect(coverage.headline).toContain('1,571');
    expect(coverage.headline).toContain('2,110');
    expect(coverage.headline).toContain('539');
    expect(coverage.headline).toContain('11 errors');
    expect(coverage.headline).toContain('11 warnings');
  });

  it('zero events → null percentage and "unknown" confidence, never a fabricated 100%', () => {
    const coverage = computeAttributionCoverage({
      totalEvents: 0,
      unattributedEvents: 0,
      unattributedErrors: 0,
      unattributedWarnings: 0,
      windowDays: 7,
    });
    expect(coverage.coveragePct).toBeNull();
    expect(coverage.confidence).toBe('unknown');
    expect(coverage.headline).toMatch(/cannot be assessed/i);
  });

  it('full coverage → high confidence', () => {
    const coverage = computeAttributionCoverage({
      totalEvents: 100,
      unattributedEvents: 2,
      unattributedErrors: 0,
      unattributedWarnings: 0,
      windowDays: 7,
    });
    expect(coverage.confidence).toBe('high');
  });

  it('under 70% covered → low confidence', () => {
    const coverage = computeAttributionCoverage({
      totalEvents: 100,
      unattributedEvents: 50,
      unattributedErrors: 0,
      unattributedWarnings: 0,
      windowDays: 7,
    });
    expect(coverage.confidence).toBe('low');
  });

  it('singular grammar for exactly one unattributed error/warning', () => {
    const coverage = computeAttributionCoverage({
      totalEvents: 10,
      unattributedEvents: 1,
      unattributedErrors: 1,
      unattributedWarnings: 0,
      windowDays: 7,
    });
    expect(coverage.headline).toContain('1 error,');
    expect(coverage.headline).toContain('0 warnings');
  });
});

describe('classifyUnregisteredStatus', () => {
  it('errors present and recent/active → red (an unregistered tag can still be an active fire)', () => {
    expect(classifyUnregisteredStatus({ errors: 5, warnings: 0, total: 5 }, 'active')).toBe('red');
    expect(classifyUnregisteredStatus({ errors: 1, warnings: 0, total: 1 }, 'recent')).toBe('red');
  });

  it('errors present but stale (the "integrations" case) → amber, not red', () => {
    expect(classifyUnregisteredStatus({ errors: 317, warnings: 0, total: 317 }, 'stale')).toBe('amber');
  });

  it('warnings only, any recency → amber', () => {
    expect(classifyUnregisteredStatus({ errors: 0, warnings: 3, total: 3 }, 'stale')).toBe('amber');
  });

  it('nothing but info-level traffic → neutral, never green (no tier exists to call it healthy against)', () => {
    expect(classifyUnregisteredStatus({ errors: 0, warnings: 0, total: 12 }, 'active')).toBe('neutral');
  });
});

describe('compareFeatureDetailRows / rankFeatureDetailRows — recency-aware ranking', () => {
  const rowOf = (over: Partial<FeatureDetailRankable>): FeatureDetailRankable => ({
    status: 'green',
    recency: 'no_activity',
    counts: { errors: 0, warnings: 0, total: 0 },
    ...over,
  });

  it('status dominates: red always outranks amber regardless of recency or volume', () => {
    const quietRed = rowOf({ status: 'red', recency: 'stale', counts: { errors: 1, warnings: 0, total: 1 } });
    const loudActiveAmber = rowOf({
      status: 'amber',
      recency: 'active',
      counts: { errors: 900, warnings: 900, total: 1800 },
    });
    expect(compareFeatureDetailRows(quietRed, loudActiveAmber)).toBeLessThan(0);
  });

  it("the exact scenario in the brief: a loud-but-stale amber (317 stale errors, 'integrations') ranks BELOW a smaller but currently-firing amber", () => {
    const integrationsLikeStale = rowOf({
      status: 'amber',
      recency: 'stale',
      counts: { errors: 317, warnings: 0, total: 317 },
    });
    const smallActiveFire = rowOf({
      status: 'amber',
      recency: 'active',
      counts: { errors: 3, warnings: 0, total: 3 },
    });
    const ranked = rankFeatureDetailRows([integrationsLikeStale, smallActiveFire]);
    expect(ranked[0]).toBe(smallActiveFire);
    expect(ranked[1]).toBe(integrationsLikeStale);
  });

  it('the same scenario also holds for two REGISTERED rows sharing a status — the recency tiebreak is not only reachable via the unregistered path', () => {
    // computeFeatureStatus's own hysteresis usually decays a stopped burst
    // back to green/neutral before this page ever sees it — but nothing
    // prevents a registered feature from landing on 'amber' for a reason
    // OTHER than the fingerprint-rate rule (e.g. unresolved non-critical
    // Sentry issues, or a heartbeat-staleness amber, both of which look at
    // different signals than "admin_events for this tag in the last 72h").
    // The comparator must not silently assume "amber" only ever means
    // "currently loud" — recency still has to do its job within that tier.
    const staleRegisteredAmber = rowOf({
      status: 'amber',
      recency: 'stale',
      counts: { errors: 200, warnings: 0, total: 200 },
    });
    const activeRegisteredAmber = rowOf({
      status: 'amber',
      recency: 'active',
      counts: { errors: 2, warnings: 0, total: 2 },
    });
    const ranked = rankFeatureDetailRows([staleRegisteredAmber, activeRegisteredAmber]);
    expect(ranked[0]).toBe(activeRegisteredAmber);
    expect(ranked[1]).toBe(staleRegisteredAmber);
  });

  it('within the same status AND recency, higher volume ranks first (the only place volume decides anything)', () => {
    const louder = rowOf({ status: 'amber', recency: 'recent', counts: { errors: 10, warnings: 0, total: 10 } });
    const quieter = rowOf({ status: 'amber', recency: 'recent', counts: { errors: 2, warnings: 0, total: 2 } });
    const ranked = rankFeatureDetailRows([quieter, louder]);
    expect(ranked[0]).toBe(louder);
  });

  it('a full mixed list sorts red > amber > neutral > green, honoring recency within each tier', () => {
    const green = rowOf({ status: 'green' });
    const neutral = rowOf({ status: 'neutral' });
    const staleAmber = rowOf({ status: 'amber', recency: 'stale', counts: { errors: 50, warnings: 0, total: 50 } });
    const activeRed = rowOf({ status: 'red', recency: 'active', counts: { errors: 1, warnings: 0, total: 1 } });
    const ranked = rankFeatureDetailRows([green, staleAmber, neutral, activeRed]);
    expect(ranked).toEqual([activeRed, staleAmber, neutral, green]);
  });
});

// ---------------------------------------------------------------------------
// fetchFeatureHealthDetail — wiring test. Confirms the end-to-end honesty +
// merge behavior: an unregistered tag surfaces as its own row, the coverage
// panel reflects the exact head-counts (not the bounded page), and a failed
// coverage query degrades to `coverage: null` rather than a fabricated figure.
// ---------------------------------------------------------------------------
describe('fetchFeatureHealthDetail', () => {
  const registeredHealth: FeatureHealth = {
    key: 'round_tracking',
    app: 'golfhelm',
    label: 'Round Tracking',
    status: 'green',
    trend: 'flat',
    reason: 'Healthy.',
    summary: '0 error incident(s).',
    topSignatures: [],
    drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 1 },
    healthSignal: 'Round submits complete.',
    knownGaps: [],
  };

  beforeEach(() => {
    vi.mocked(mocks.fetchFeatureHealth).mockReset();
    vi.mocked(createAdminClient).mockReset();
    // fetchFeatureHealthDetail() calls `new Date()` internally (to derive
    // both the query window and each row's recency classification) — pin it
    // so the fixture timestamps below (built off the fixed NOW constant) land
    // in the past relative to the code under test, not the real wall clock.
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges a raw admin_events tag with no registry entry into its own row, and reports exact coverage', async () => {
    mocks.fetchFeatureHealth.mockResolvedValue({
      features: [registeredHealth],
      generatedAt: NOW.toISOString(),
      degraded: false,
      degradedReason: null,
    });

    const rawRows = [
      // round_tracking (registered) — one recent error.
      { id: 'r1', feature: 'round_tracking', severity: 'error', title: 'boom', created_at: hoursAgoIso(1), fingerprint: 'fp-1' },
      // integrations (NOT a FEATURE_REGISTRY key) — a stale burst.
      { id: 'r2', feature: 'integrations', severity: 'error', title: 'webhook 500', created_at: hoursAgoIso(80), fingerprint: 'fp-2' },
      { id: 'r3', feature: 'integrations', severity: 'error', title: 'webhook 500', created_at: hoursAgoIso(81), fingerprint: 'fp-2' },
    ];

    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient([
        { data: rawRows, error: null },
        { count: 2110, error: null },
        { count: 539, error: null },
        { count: 11, error: null },
        { count: 11, error: null },
      ]) as unknown as ReturnType<typeof createAdminClient>,
    );

    const result = await fetchFeatureHealthDetail();

    expect(result.degraded).toBe(false);
    expect(result.coverage).toMatchObject({ totalEvents: 2110, unattributedEvents: 539 });
    expect(result.countsAvailable).toBe(true);
    expect(result.rowsTruncated).toBe(false);

    const integrations = result.rows.find((r) => r.key === 'integrations');
    expect(integrations).toBeDefined();
    expect(integrations!.kind).toBe('unregistered');
    expect(integrations!.status).toBe('amber'); // stale burst, not red
    expect(integrations!.counts).toEqual({ errors: 2, warnings: 0, total: 2 });
    expect(integrations!.reason).toMatch(/not a key in FEATURE_REGISTRY/);

    const roundTracking = result.rows.find((r) => r.key === 'round_tracking');
    expect(roundTracking).toBeDefined();
    expect(roundTracking!.kind).toBe('registered');
    expect(roundTracking!.counts).toEqual({ errors: 1, warnings: 0, total: 1 });
  });

  it('a failed coverage query degrades to coverage:null with an error, never a fabricated percentage', async () => {
    mocks.fetchFeatureHealth.mockResolvedValue({
      features: [registeredHealth],
      generatedAt: NOW.toISOString(),
      degraded: false,
      degradedReason: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(
      mockAdminClient([{ data: null, error: { message: 'connection refused' } }]) as unknown as ReturnType<
        typeof createAdminClient
      >,
    );

    const result = await fetchFeatureHealthDetail();

    expect(result.coverage).toBeNull();
    expect(result.coverageError).toMatch(/connection refused/);
    expect(result.countsAvailable).toBe(false);
    expect(result.rowsTruncated).toBe(false);

    // The registered row still renders — this failure is scoped to the
    // coverage/raw-event half, not the whole detail surface — but its
    // per-feature counts must read as UNAVAILABLE, never as a fabricated
    // "0 errors" that looks identical to a genuinely quiet week (the exact
    // "error → []" failure the repo's Noise-Discipline Charter forbids).
    const roundTracking = result.rows.find((r) => r.key === 'round_tracking');
    expect(roundTracking).toBeDefined();
    expect(roundTracking!.counts).toEqual({ errors: 0, warnings: 0, total: 0 });
    expect(roundTracking!.lastEventAt).toBeNull();
    // Status/trend, in contrast, are UNAFFECTED — they come from the
    // separately-mocked fetchFeatureHealth(), which still succeeded.
    expect(roundTracking!.status).toBe('green');

    // No unregistered tag rows are fabricated either — the whole concept is
    // derived from the failed query, so silence (not "0 found") is correct.
    expect(result.rows.some((r) => r.kind === 'unregistered')).toBe(false);
  });
});
