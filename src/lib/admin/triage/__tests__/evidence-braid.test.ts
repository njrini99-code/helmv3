import { describe, it, expect } from 'vitest';
import { buildEvidenceBraid } from '../evidence-braid';
import type { UnifiedIncident, IncidentSourceEvidence, IncidentRepair } from '@/lib/admin/incidents/types';

function sourceEvidence(overrides: Partial<IncidentSourceEvidence> = {}): IncidentSourceEvidence {
  return {
    source: 'sentry',
    health: 'reading',
    reason: null,
    occurrences: 1,
    firstSeen: null,
    lastSeen: null,
    ref: null,
    permalink: null,
    summary: '',
    ...overrides,
  } as IncidentSourceEvidence;
}

function repair(overrides: Partial<IncidentRepair> = {}): IncidentRepair {
  return {
    status: 'pr-open',
    prNumber: 5,
    prUrl: 'https://github.com/x/y/pull/5',
    branch: 'agent/fix',
    checks: null,
    mergedAt: null,
    mergeSha: null,
    note: null,
    ...overrides,
  };
}

function incident(overrides: Partial<UnifiedIncident> = {}): UnifiedIncident {
  return {
    id: 'inc-1',
    featureId: 'round_tracking',
    firstSeen: '2026-09-03T00:00:00.000Z',
    sources: [sourceEvidence()],
    repair: null,
    ...overrides,
  } as UnifiedIncident;
}

const FEATURE = 'round_tracking' as UnifiedIncident['featureId'] & string;
const NOW = Date.parse('2026-09-03T12:00:00.000Z');

describe('buildEvidenceBraid', () => {
  it('scopes to only the selected feature, excluding incidents on other features', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ featureId: FEATURE as never }), incident({ id: 'inc-2', featureId: 'stats' as never })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const allIds = view.points.flatMap((p) => p.incidentIds);
    expect(allIds).toEqual(['inc-1']);
  });

  it('reads sentry as "reading" when the incident source evidence says so', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ sources: [sourceEvidence({ source: 'sentry', health: 'reading' })] })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const point = view.points.find((p) => p.incidentIds.includes('inc-1'))!;
    const sentryCell = point.cells.find((c) => c.source === 'sentry')!;
    expect(sentryCell.mark).toBe('check');
  });

  it('jobs is always unknown — no incident-to-job linkage exists', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident()],
      now: NOW,
      flightRecorderLinkedIds: new Set(['inc-1']),
    });
    for (const point of view.points) {
      const jobsCell = point.cells.find((c) => c.source === 'jobs')!;
      expect(jobsCell.health).toBe('unknown');
    }
  });

  it('flight-recorder reads "reading" only for a correlated incident, "unknown" for others', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ id: 'inc-1' }), incident({ id: 'inc-2', firstSeen: '2026-09-03T06:00:00.000Z' })],
      now: NOW,
      flightRecorderLinkedIds: new Set(['inc-1']),
    });
    const p1 = view.points.find((p) => p.incidentIds.includes('inc-1'))!;
    expect(p1.cells.find((c) => c.source === 'flight-recorder')!.mark).toBe('check');
    const p2 = view.points.find((p) => p.incidentIds.includes('inc-2'))!;
    expect(p2.cells.find((c) => c.source === 'flight-recorder')!.mark).not.toBe('check');
  });

  it('every point reads flight-recorder as blind board-wide when the trace store could not be read', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident()],
      now: NOW,
      flightRecorderLinkedIds: null,
    });
    expect(view.flightRecorderBlind).toBe(true);
    const point = view.points.find((p) => p.incidentIds.includes('inc-1'))!;
    expect(point.cells.find((c) => c.source === 'flight-recorder')!.mark).toBe('blind');
  });

  it('github reads "reading" for a real repair PR, "unknown" (not blind) when no PR exists yet', () => {
    const withPr = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ repair: repair() })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const p1 = withPr.points.find((p) => p.incidentIds.includes('inc-1'))!;
    expect(p1.cells.find((c) => c.source === 'github')!.mark).toBe('check');

    const noPr = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ repair: repair({ status: 'none', prUrl: null }) })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const p2 = noPr.points.find((p) => p.incidentIds.includes('inc-1'))!;
    expect(p2.cells.find((c) => c.source === 'github')!.health).toBe('unknown');
  });

  it('github reads blind, distinct from unknown, when the GitHub read itself failed', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ repair: repair({ status: 'unknown', prUrl: null, note: 'GitHub API timeout' }) })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const point = view.points.find((p) => p.incidentIds.includes('inc-1'))!;
    expect(point.cells.find((c) => c.source === 'github')!.health).toBe('blind');
  });

  it('a feature with zero incidents still returns a full set of buckets, all unknown, not empty', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    expect(view.points.length).toBeGreaterThan(0);
    for (const point of view.points) {
      expect(point.present).toBe(0);
      expect(point.incidentIds).toEqual([]);
    }
  });

  it('never conflates "read incompletely" with "clean zero" — every cell distinguishes the two', () => {
    const view = buildEvidenceBraid({
      featureId: FEATURE as never,
      incidents: [incident({ sources: [sourceEvidence({ source: 'sentry', health: 'partial', reason: 'Rate limited.' })] })],
      now: NOW,
      flightRecorderLinkedIds: new Set(),
    });
    const point = view.points.find((p) => p.incidentIds.includes('inc-1'))!;
    const cell = point.cells.find((c) => c.source === 'sentry')!;
    expect(cell.mark).toBe('question');
    expect(cell.reason).toBe('Rate limited.');
  });
});
