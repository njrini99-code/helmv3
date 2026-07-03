import { describe, it, expect } from 'vitest';
import { parseErrorsFilters, describeErrorsFilters, buildFilteredIncidentsReport } from '@/lib/admin/data/errors';
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
  it('always includes the window and nothing else when no other filters are set', () => {
    expect(describeErrorsFilters({ windowHours: 24 })).toBe('window=24h');
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
    ).toBe('window=168h; sport=golf; severity=critical; source=rls_denial; feature=Round Tracking (round_tracking)');
  });
});

describe('buildFilteredIncidentsReport', () => {
  const item = (over: Partial<TriageItem>): TriageItem => ({
    key: 'app:fp-1', origin: 'app', title: 'savePartialRound failed', severity: 'error',
    sport: 'golf', occurrences: 1, affectedUsers: 1,
    firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-01T00:00:00Z',
    permalink: null, eventIds: ['e1'], substatus: null,
    report: '# Incident report: savePartialRound failed',
    ...over,
  });

  it('reuses each incident\'s own pre-built report and describes the active filters in the header', () => {
    const doc = buildFilteredIncidentsReport([item({})], { windowHours: 24, sport: 'golf' });
    expect(doc).toContain('filters: window=24h; sport=golf');
    expect(doc).toContain('# Incident report: savePartialRound failed');
    expect(doc).toContain('incident count: 1');
  });

  it('renders the no-match placeholder when the filtered set is empty', () => {
    const doc = buildFilteredIncidentsReport([], { windowHours: 24 });
    expect(doc).toContain('_no incidents match the current filters_');
  });
});
