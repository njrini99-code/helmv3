/**
 * `load-distance-profile.ts` is a deliberately thin composition root
 * (`loadPlayerContext` -> `computeDistanceProfile`, nothing else) — A1 and A2
 * each already have their own known-answer test suites
 * (`load-player-context.test.ts`, `distance-profile.test.ts`), so this file
 * only proves the WIRING: the loader passes the context's `shots`/`holes`
 * and the caller's own `scope` through to the metric core untouched, and
 * returns exactly what the core computed — never re-deriving or reshaping
 * either A1's read or A2's result itself.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import type { PlayerContextDeps, PlayerContextResult } from '@/lib/coachhelm/v3/context/load-player-context';
import type { MetricResult } from '@/lib/coachhelm/v3/metrics/types';

const loadPlayerContextMock = vi.fn<
  (scope: AnalysisScope, deps: PlayerContextDeps) => Promise<PlayerContextResult>
>();
const computeDistanceProfileMock = vi.fn<
  (facts: readonly ShotFact[], scope: AnalysisScope, holes: readonly HoleContext[]) => MetricResult[]
>();

vi.mock('@/lib/coachhelm/v3/context/load-player-context', () => ({
  loadPlayerContext: (...args: Parameters<typeof loadPlayerContextMock>) => loadPlayerContextMock(...args),
}));
vi.mock('@/lib/coachhelm/v3/metrics/distance-profile', () => ({
  computeDistanceProfile: (...args: Parameters<typeof computeDistanceProfileMock>) =>
    computeDistanceProfileMock(...args),
}));

const { loadDistanceProfile } = await import('@/lib/coachhelm/v3/metrics/load-distance-profile');

const SCOPE: AnalysisScope = {
  player_id: 'player-1',
  window_start: null,
  window_end: null,
  analysis_cutoff: '2026-08-01T00:00:00.000Z',
};

describe('loadDistanceProfile', () => {
  it('passes the loaded shots/scope/holes straight through to computeDistanceProfile and returns its result verbatim', async () => {
    const shots = [{ round_id: 'r1' }] as unknown as ShotFact[];
    const holes = [{ round_id: 'r1', hole_number: 1, par: 4 }] as unknown as HoleContext[];
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
        dimensions: { band: '50_125ft' },
        metricId: 'approach_green_hit_rate',
        unit: 'percent',
        value: 42,
        numerator: 5,
        denominator: 10,
        eligibleCount: 10,
        observedCount: 10,
        distinctRounds: 3,
        status: 'supported',
        exclusions: {},
        distanceMethod: 'recorded',
      },
    ];
    computeDistanceProfileMock.mockReturnValueOnce(expected);

    const deps = { supabase: {} } as PlayerContextDeps;
    const result = await loadDistanceProfile(SCOPE, deps);

    expect(loadPlayerContextMock).toHaveBeenCalledWith(SCOPE, deps);
    expect(computeDistanceProfileMock).toHaveBeenCalledWith(shots, SCOPE, holes);
    expect(result).toBe(expected);
  });
});
