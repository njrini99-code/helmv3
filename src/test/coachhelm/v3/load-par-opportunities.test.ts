/**
 * `load-par-opportunities.ts` is a deliberately thin composition root
 * (`loadPlayerContext` -> `computeParOpportunities`, nothing else) — A1 and
 * A3 each already have their own known-answer test suites
 * (`load-player-context.test.ts`, `par-opportunities.test.ts`), so this file
 * only proves the WIRING: the loader passes the context's `shots`/`holes`
 * and the caller's own `scope` through to the metric core untouched, and
 * returns exactly what the core computed — never re-deriving or reshaping
 * either A1's read or A3's result itself. Mirrors
 * `load-distance-profile.test.ts` (A2's sibling loader) exactly.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import type { PlayerContextDeps, PlayerContextResult } from '@/lib/coachhelm/v3/context/load-player-context';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';

const loadPlayerContextMock = vi.fn<
  (scope: AnalysisScope, deps: PlayerContextDeps) => Promise<PlayerContextResult>
>();
const computeParOpportunitiesMock = vi.fn<
  (facts: ShotFact[], holes: HoleContext[], scope: AnalysisScope) => MetricResult[]
>();

vi.mock('@/lib/coachhelm/v3/context/load-player-context', () => ({
  loadPlayerContext: (...args: Parameters<typeof loadPlayerContextMock>) => loadPlayerContextMock(...args),
}));
vi.mock('@/lib/coachhelm/v3/metrics/par-opportunities', () => ({
  computeParOpportunities: (...args: Parameters<typeof computeParOpportunitiesMock>) =>
    computeParOpportunitiesMock(...args),
}));

const { loadParOpportunities } = await import('@/lib/coachhelm/v3/metrics/load-par-opportunities');

const SCOPE: AnalysisScope = {
  player_id: 'player-1',
  window_start: null,
  window_end: null,
  analysis_cutoff: '2026-08-01T00:00:00.000Z',
};

describe('loadParOpportunities', () => {
  it('passes the loaded shots/holes/scope straight through to computeParOpportunities and returns its result verbatim', async () => {
    const shots = [{ round_id: 'r1' }] as unknown as ShotFact[];
    const holes = [{ round_id: 'r1', hole_number: 1, par: 5 }] as unknown as HoleContext[];
    const coverage = {
      holesIncluded: 1,
      holesExcludedByReason: {},
      shotsExcludedByReason: {},
      partialSequenceCount: 0,
    };
    loadPlayerContextMock.mockResolvedValueOnce({ shots, holes, coverage });

    const expected: MetricResult[] = [
      {
        scope: SCOPE,
        dimensions: { par: 5, length_group: 'all' },
        metricId: 'par_length_scoring',
        unit: 'strokes',
        value: 0.2,
        numerator: 1,
        denominator: 5,
        eligibleCount: 5,
        observedCount: 5,
        distinctRounds: 5,
        status: 'supported',
        exclusions: {},
      },
    ];
    computeParOpportunitiesMock.mockReturnValueOnce(expected);

    const deps = { supabase: {} } as PlayerContextDeps;
    const result = await loadParOpportunities(SCOPE, deps);

    expect(loadPlayerContextMock).toHaveBeenCalledWith(SCOPE, deps);
    expect(computeParOpportunitiesMock).toHaveBeenCalledWith(shots, holes, SCOPE);
    expect(result).toBe(expected);
  });
});
