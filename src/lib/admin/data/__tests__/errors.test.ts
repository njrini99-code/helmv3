import { describe, it, expect } from 'vitest';
import {
  parseErrorsFilters,
  describeErrorsFilters,
  buildFilteredIncidentsReport,
  computeAppHourlyBuckets,
  computeDailyTrend,
} from '@/lib/admin/data/errors';
import type { TriageItem } from '@/lib/admin/data/triage';

describe('parseErrorsFilters', () => {
  it('defaults to a 24h window with no filters', () => {
    expect(parseErrorsFilters({})).toEqual({ windowHours: 24 });
  });
  it('parses valid sport/severity/source/window from the URL', () => {
    expect(
      parseErrorsFilters({ sport: 'golf', severity: 'critical', source: 'rls_denial', window: '168' }),
    ).toEqual({ sport: 'golf', severity: 'critical', source: 'rls_denial', windowHours: 168 });
  });
  it('drops invalid values instead of trusting the URL', () => {
    expect(parseErrorsFilters({ sport: 'chess', severity: 'meh', window: '-5' })).toEqual({ windowHours: 24 });
  });

  // W16 Task 4 — drill-in from the Feature Health board.
  it('parses a valid feature key from the URL', () => {
    expect(parseErrorsFilters({ feature: 'round_tracking' })).toEqual({
      windowHours: 24,
      feature: 'round_tracking',
    });
  });
  it('drops an unknown feature key instead of trusting the URL (no crash, no filter)', () => {
    expect(parseErrorsFilters({ feature: 'not_a_real_feature' })).toEqual({ windowHours: 24 });
  });
  it('never accepts the excluded CRM key as a feature filter', () => {
    expect(parseErrorsFilters({ feature: 'crm_recruiting_pipeline' })).toEqual({ windowHours: 24 });
  });
});

describe('describeErrorsFilters', () => {
  // `kind` is stated UNCONDITIONALLY, including at its default. The default
  // hides every non-actionable incident (~60% of the July feed), so an export
  // header that omitted it would let a reader believe a curated slice was the
  // whole feed — the same false-completeness trap as an un-flagged row cap.
  it('always includes the window and the kind filter when nothing else is set', () => {
    expect(describeErrorsFilters({ windowHours: 24 })).toBe('window=24h; kind=actionable only');
  });

  it('names the kind explicitly when one is selected', () => {
    expect(describeErrorsFilters({ windowHours: 24, kind: 'telemetry' })).toBe(
      'window=24h; kind=Telemetry',
    );
    expect(describeErrorsFilters({ windowHours: 24, kind: 'all' })).toBe(
      'window=24h; kind=all (including non-actionable)',
    );
  });

  it('appends every active filter, feature resolved to its human label', () => {
    expect(
      describeErrorsFilters({
        windowHours: 168,
        sport: 'golf',
        severity: 'critical',
        source: 'rls_denial',
        feature: 'round_tracking',
      }),
    ).toBe(
      'window=168h; kind=actionable only; sport=golf; severity=critical; source=rls_denial; feature=Round Tracking (round_tracking)',
    );
  });
});

describe('buildFilteredIncidentsReport', () => {
  const item = (over: Partial<TriageItem>): TriageItem => ({
    key: 'app:fp-1', origin: 'app', title: 'savePartialRound failed', severity: 'error',
    sport: 'golf', occurrences: 1, affectedUsers: 1,
    firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T00:00:00Z',
    permalink: null, eventIds: ['e1'], substatus: null,
    source: 'server_action', feature: 'round_tracking', actionName: 'savePartialRound', route: '/api/golf/rounds',
    klass: 'defect', actionable: true, klassReason: 'Unexpected failure (severity-derived)',
    hasDegradedMessage: false,
    report: '# Incident report: savePartialRound failed',
    ...over,
  });

  it('reuses each incident\'s own pre-built report and describes the active filters in the header', () => {
    const doc = buildFilteredIncidentsReport([item({})], { windowHours: 24, sport: 'golf' });
    expect(doc).toContain('filters: window=24h; kind=actionable only; sport=golf');
    expect(doc).toContain('# Incident report: savePartialRound failed');
    expect(doc).toContain('incident count: 1');
  });

  it('renders the no-match placeholder when the filtered set is empty', () => {
    const doc = buildFilteredIncidentsReport([], { windowHours: 24 });
    expect(doc).toContain('_no incidents match the current filters_');
  });
});

describe('computeAppHourlyBuckets', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');

  it('groups rows into 24 rolling hourly buckets by fingerprint', () => {
    const buckets = computeAppHourlyBuckets(
      [
        { id: 'e1', fingerprint: 'fp-1', created_at: '2026-08-25T11:30:00.000Z' }, // this hour
        { id: 'e2', fingerprint: 'fp-1', created_at: '2026-08-25T11:45:00.000Z' }, // this hour
        { id: 'e3', fingerprint: 'fp-1', created_at: '2026-08-24T12:30:00.000Z' }, // oldest bucket (right at window start)
        { id: 'e4', fingerprint: 'fp-2', created_at: '2026-08-25T11:00:00.000Z' },
      ],
      24,
      NOW,
    );
    expect(buckets['fp-1']).toHaveLength(24);
    expect(buckets['fp-1']![23]).toBe(2); // most-recent bucket
    expect(buckets['fp-1']![0]).toBe(1); // oldest bucket
    expect(buckets['fp-2']![23]).toBe(1);
  });

  it('falls back to the `row:<id>` synthetic key for a fingerprint-less row, matching mergeTriage', () => {
    const buckets = computeAppHourlyBuckets(
      [{ id: 'e9', fingerprint: null, created_at: '2026-08-25T11:00:00.000Z' }],
      24,
      NOW,
    );
    expect(buckets['row:e9']).toBeDefined();
    expect(buckets['row:e9']![23]).toBe(1);
  });

  it('drops rows outside the trailing 24h window entirely', () => {
    const buckets = computeAppHourlyBuckets(
      [{ id: 'e1', fingerprint: 'fp-old', created_at: '2026-08-20T00:00:00.000Z' }],
      24,
      NOW,
    );
    expect(buckets['fp-old']).toBeUndefined();
  });

  it('returns an empty map — never a false-zero-filled bucket — when the fetch window is under 24h', () => {
    const buckets = computeAppHourlyBuckets(
      [{ id: 'e1', fingerprint: 'fp-1', created_at: '2026-08-25T11:30:00.000Z' }],
      1,
      NOW,
    );
    expect(buckets).toEqual({});
  });

  it('ignores malformed timestamps rather than throwing', () => {
    const buckets = computeAppHourlyBuckets(
      [{ id: 'e1', fingerprint: 'fp-1', created_at: 'not-a-date' }],
      24,
      NOW,
    );
    expect(buckets).toEqual({});
  });
});

describe('computeDailyTrend', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');

  it('buckets timestamps into 7 rolling daily counts, oldest first', () => {
    const buckets = computeDailyTrend(
      [
        '2026-08-25T06:00:00.000Z', // today
        '2026-08-25T09:00:00.000Z', // today
        '2026-08-18T18:00:00.000Z', // oldest bucket (just after window start)
      ],
      7,
      NOW,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[6]).toBe(2); // most recent day
    expect(buckets[0]).toBe(1); // oldest day
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('drops null/undefined/unparseable timestamps and timestamps outside the window', () => {
    const buckets = computeDailyTrend(
      [null, undefined, 'garbage', '2026-07-01T00:00:00.000Z'],
      7,
      NOW,
    );
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('returns an all-zero array — not an error — for an empty input', () => {
    expect(computeDailyTrend([], 7, NOW)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
