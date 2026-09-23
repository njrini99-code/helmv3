import { describe, expect, it } from 'vitest';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import {
  computeComparableOpportunities,
  type ComparableOpportunitiesInput,
  type MatchingSpec,
} from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';

/**
 * A9 (repair-plan addendum §14.12) — comparable-opportunities pure core.
 * See `evaluation/comparable-opportunities.ts`'s file header for the
 * shot-level-vs-round-level distinction from `causality/attribute.ts`.
 */

const INTERVENTION_AT = '2026-06-15T00:00:00.000Z';
const BASELINE_WINDOW = { start: '2026-06-01T00:00:00.000Z', end: '2026-06-14T23:59:59.999Z' };
const FOLLOW_UP_WINDOW = { start: '2026-06-15T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' };

function hole(overrides: Partial<HoleContext> & Pick<HoleContext, 'round_id' | 'hole_number' | 'par' | 'total_strokes'>): HoleContext {
  return {
    course_id: null,
    penalty_strokes: 0,
    putts: 2,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

/** A rough-lie approach opportunity from 100-150ft, in or out of the spec's
 *  matched band/lie/role depending on overrides. Defaults land squarely
 *  inside the spec used by `spec()` below. */
function approachShot(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number' | 'observed_at'>): ShotFact {
  return {
    shot_type: 'approach',
    club_type: 'non_driver',
    intent: 'unknown',
    distance_to_hole_before_feet: 120,
    distance_to_hole_after_feet: null,
    lie_before: 'rough',
    lie_after: null,
    result: 'fairway',
    is_penalty: false,
    putt_made: null,
    ...overrides,
  };
}

function spec(overrides: Partial<MatchingSpec> = {}): MatchingSpec {
  return {
    distanceBand: { label: '100-150ft', minFt: 100, maxFt: 150 },
    distanceBandVersion: 'test-band-v1',
    lie: 'rough',
    shotRole: 'approach',
    benchmarkVersion: 'test-benchmark-v1',
    ...overrides,
  };
}

function baseInput(overrides: Partial<ComparableOpportunitiesInput> = {}): ComparableOpportunitiesInput {
  return {
    facts: [],
    holes: [],
    player_id: 'p-1',
    analysis_cutoff: '2026-12-31T00:00:00.000Z',
    interventionAt: INTERVENTION_AT,
    baselineWindow: BASELINE_WINDOW,
    followUpWindow: FOLLOW_UP_WINDOW,
    baselineSpec: spec(),
    followUpSpec: spec(),
    outcome: { kind: 'rate', isSuccess: (s) => s.result === 'green' },
    multipleInterventions: false,
    metricId: 'approach_gir_100_150ft_rough',
    ...overrides,
  };
}

/** `n` matched approach shots split across `rounds` distinct round ids, all
 *  timestamped inside `window`, with `successes` of them reaching the green
 *  (the rest miss). Shots are spread round-robin across rounds so every
 *  round contributes at least one shot once `n >= rounds`. */
function matchedShots(opts: {
  roundPrefix: string;
  rounds: number;
  n: number;
  successes: number;
  window: { start: string; end: string };
}): ShotFact[] {
  const { roundPrefix, rounds, n, successes, window } = opts;
  const shots: ShotFact[] = [];
  const windowStartMs = new Date(window.start).getTime();
  for (let i = 0; i < n; i++) {
    const round_id = `${roundPrefix}-${i % rounds}`;
    shots.push(
      approachShot({
        round_id,
        hole_number: (i % 9) + 1,
        shot_number: 2,
        observed_at: new Date(windowStartMs + i * 3600_000).toISOString(),
        result: i < successes ? 'green' : 'fairway',
      }),
    );
  }
  return shots;
}

describe('computeComparableOpportunities', () => {
  it('reports a matched improvement: same distance/lie/role, higher follow-up success rate', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 6, successes: 5, window: FOLLOW_UP_WINDOW });
    const outcome = computeComparableOpportunities(baseInput({ facts: [...baselineFacts, ...followUpFacts] }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).toBe('observed_change');
    expect(outcome.result.baseline.status).toBe('supported');
    expect(outcome.result.followUp.status).toBe('supported');
    expect(outcome.result.baseline.value).toBeCloseTo((2 / 6) * 100, 5);
    expect(outcome.result.followUp.value).toBeCloseTo((5 / 6) * 100, 5);
    expect(outcome.result.observedChange).toBeCloseTo(((5 / 6) - (2 / 6)) * 100, 5);
    expect(outcome.result.baseline.distinctRounds).toBe(2);
    expect(outcome.result.followUp.distinctRounds).toBe(2);
    expect(outcome.result.methodVersion).toBe('comparable_opportunities_v1');
  });

  it('downgrades a supported improvement to observed_change_limited when multipleInterventions is set', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 6, successes: 5, window: FOLLOW_UP_WINDOW });
    const outcome = computeComparableOpportunities(
      baseInput({ facts: [...baselineFacts, ...followUpFacts], multipleInterventions: true }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).toBe('observed_change_limited');
    expect(outcome.result.multipleInterventions).toBe(true);
    // Still an observed number — multipleInterventions caveats the claim, it
    // does not null out what was actually measured.
    expect(outcome.result.observedChange).not.toBeNull();
  });

  it('returns insufficient_evidence when follow-up has too few matched opportunities, without hiding its value', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 3, window: BASELINE_WINDOW });
    // Only 3 shots (< MIN_OPPORTUNITY_N = 5) on the follow-up side.
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 3, successes: 2, window: FOLLOW_UP_WINDOW });
    const outcome = computeComparableOpportunities(baseInput({ facts: [...baselineFacts, ...followUpFacts] }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.status).toBe('insufficient_evidence');
    expect(outcome.result.baseline.status).toBe('supported');
    expect(outcome.result.followUp.status).toBe('insufficient');
    // Descriptive value stays visible even though support is thin.
    expect(outcome.result.followUp.value).toBeCloseTo((2 / 3) * 100, 5);
    expect(outcome.result.observedChange).toBeNull();
  });

  it('rejects the comparison when baseline and follow-up specs disagree on distance band version', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 6, successes: 5, window: FOLLOW_UP_WINDOW });
    const outcome = computeComparableOpportunities(
      baseInput({
        facts: [...baselineFacts, ...followUpFacts],
        followUpSpec: spec({ distanceBandVersion: 'test-band-v2' }),
      }),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('band_version_mismatch');
  });

  it('rejects the comparison when baseline and follow-up specs disagree on benchmark version', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 6, successes: 5, window: FOLLOW_UP_WINDOW });
    const outcome = computeComparableOpportunities(
      baseInput({
        facts: [...baselineFacts, ...followUpFacts],
        followUpSpec: spec({ benchmarkVersion: 'test-benchmark-v2' }),
      }),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('benchmark_version_mismatch');
  });

  it('assigns a shot recorded at exactly the intervention instant to follow-up, never baseline', () => {
    // Deliberately overlapping window bounds at the instant itself, to prove
    // the split is decided by interventionAt and not by window membership
    // alone — see `splitSide`'s doc comment in the module under test.
    const boundaryShot = approachShot({
      round_id: 'r-boundary',
      hole_number: 1,
      shot_number: 2,
      observed_at: INTERVENTION_AT,
      result: 'green',
    });
    const outcome = computeComparableOpportunities(
      baseInput({
        facts: [boundaryShot],
        baselineWindow: { start: '2026-06-01T00:00:00.000Z', end: INTERVENTION_AT },
        followUpWindow: { start: INTERVENTION_AT, end: '2026-06-30T00:00:00.000Z' },
      }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.baseline.eligibleCount).toBe(0);
    expect(outcome.result.followUp.eligibleCount).toBe(1);
  });

  it('discloses course mix and opportunity-count imbalance between the two sides', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 3, n: 9, successes: 5, window: FOLLOW_UP_WINDOW });
    const holes: HoleContext[] = [
      hole({ round_id: 'base-0', hole_number: 1, par: 4, total_strokes: 4, course_id: 'course-a' }),
      hole({ round_id: 'base-1', hole_number: 1, par: 4, total_strokes: 4, course_id: 'course-a' }),
      hole({ round_id: 'post-0', hole_number: 1, par: 4, total_strokes: 4, course_id: 'course-a' }),
      hole({ round_id: 'post-1', hole_number: 1, par: 4, total_strokes: 4, course_id: 'course-b' }),
      hole({ round_id: 'post-2', hole_number: 1, par: 4, total_strokes: 4, course_id: 'course-c' }),
    ];
    const outcome = computeComparableOpportunities(
      baseInput({ facts: [...baselineFacts, ...followUpFacts], holes }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.disclosedDifferences.courseMix.shared).toEqual(['course-a']);
    expect(outcome.result.disclosedDifferences.courseMix.followUpOnly).toEqual(['course-b', 'course-c']);
    expect(outcome.result.disclosedDifferences.courseMix.baselineOnly).toEqual([]);
    expect(outcome.result.disclosedDifferences.opportunityCountImbalance).toBe(9 - 6);
  });
});
