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
 * shot-level-vs-round-level distinction from `causality/attribute.ts`, and
 * for why there is a single `MatchingSpec` shared by both sides rather than
 * a baseline/follow-up pair (PR #1992 review, MUST 1).
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
 *  inside the spec used by `spec()` below. `proximity_ft` is a convenience
 *  overlay for the 'mean' tests — not a real `ShotFact` field, stripped in
 *  `approachShot` before returning. */
function approachShot(
  overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number' | 'observed_at'> & { proximity_ft?: number | null },
): ShotFact {
  const { proximity_ft, ...rest } = overrides;
  return {
    shot_type: 'approach',
    club_type: 'non_driver',
    intent: 'unknown',
    distance_to_hole_before_feet: 120,
    distance_to_hole_after_feet: proximity_ft ?? null,
    lie_before: 'rough',
    lie_after: null,
    result: 'fairway',
    is_penalty: false,
    putt_made: null,
    ...rest,
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
    spec: spec(),
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
    const result = computeComparableOpportunities(baseInput({ facts: [...baselineFacts, ...followUpFacts] }));

    expect(result.status).toBe('observed_change');
    expect(result.baseline.status).toBe('supported');
    expect(result.followUp.status).toBe('supported');
    expect(result.baseline.value).toBeCloseTo((2 / 6) * 100, 5);
    expect(result.followUp.value).toBeCloseTo((5 / 6) * 100, 5);
    expect(result.observedChange).toBeCloseTo(((5 / 6) - (2 / 6)) * 100, 5);
    expect(result.baseline.distinctRounds).toBe(2);
    expect(result.followUp.distinctRounds).toBe(2);
    expect(result.methodVersion).toBe('comparable_opportunities_v1');
  });

  it('downgrades a supported improvement to observed_change_limited when multipleInterventions is set', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 2, window: BASELINE_WINDOW });
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 6, successes: 5, window: FOLLOW_UP_WINDOW });
    const result = computeComparableOpportunities(
      baseInput({ facts: [...baselineFacts, ...followUpFacts], multipleInterventions: true }),
    );

    expect(result.status).toBe('observed_change_limited');
    expect(result.multipleInterventions).toBe(true);
    // Still an observed number — multipleInterventions caveats the claim, it
    // does not null out what was actually measured.
    expect(result.observedChange).not.toBeNull();
  });

  it('returns insufficient_evidence when follow-up has too few matched opportunities, without hiding its value', () => {
    const baselineFacts = matchedShots({ roundPrefix: 'base', rounds: 2, n: 6, successes: 3, window: BASELINE_WINDOW });
    // Only 3 shots (< MIN_OPPORTUNITY_N = 5) on the follow-up side.
    const followUpFacts = matchedShots({ roundPrefix: 'post', rounds: 2, n: 3, successes: 2, window: FOLLOW_UP_WINDOW });
    const result = computeComparableOpportunities(baseInput({ facts: [...baselineFacts, ...followUpFacts] }));

    expect(result.status).toBe('insufficient_evidence');
    expect(result.baseline.status).toBe('supported');
    expect(result.followUp.status).toBe('insufficient');
    // Descriptive value stays visible even though support is thin.
    expect(result.followUp.value).toBeCloseTo((2 / 3) * 100, 5);
    expect(result.observedChange).toBeNull();
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
    const result = computeComparableOpportunities(
      baseInput({
        facts: [boundaryShot],
        baselineWindow: { start: '2026-06-01T00:00:00.000Z', end: INTERVENTION_AT },
        followUpWindow: { start: INTERVENTION_AT, end: '2026-06-30T00:00:00.000Z' },
      }),
    );

    expect(result.baseline.eligibleCount).toBe(0);
    expect(result.followUp.eligibleCount).toBe(1);
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
    const result = computeComparableOpportunities(
      baseInput({ facts: [...baselineFacts, ...followUpFacts], holes }),
    );

    expect(result.disclosedDifferences.courseMix.shared).toEqual(['course-a']);
    expect(result.disclosedDifferences.courseMix.followUpOnly).toEqual(['course-b', 'course-c']);
    expect(result.disclosedDifferences.courseMix.baselineOnly).toEqual([]);
    expect(result.disclosedDifferences.opportunityCountImbalance).toBe(9 - 6);
  });

  describe("'mean' outcomes", () => {
    /** `n` matched approach shots across `rounds` distinct rounds, each with
     *  a given proximity-to-hole value (feet) after the shot. `nullFor`
     *  marks shot indices whose value comes back `null` (no usable
     *  measurement) instead of a number. */
    function meanShots(opts: {
      roundPrefix: string;
      rounds: number;
      values: Array<number | null>;
      window: { start: string; end: string };
    }): ShotFact[] {
      const { roundPrefix, rounds, values, window } = opts;
      const windowStartMs = new Date(window.start).getTime();
      return values.map((v, i) =>
        approachShot({
          round_id: `${roundPrefix}-${i % rounds}`,
          hole_number: (i % 9) + 1,
          shot_number: 2,
          observed_at: new Date(windowStartMs + i * 3600_000).toISOString(),
          proximity_ft: v,
        }),
      );
    }

    const meanOutcome = {
      kind: 'mean' as const,
      unit: 'feet' as const,
      valueOf: (s: ShotFact) => s.distance_to_hole_after_feet,
    };

    it('reports a known-answer mean over matched opportunities', () => {
      const baselineFacts = meanShots({ roundPrefix: 'base', rounds: 2, values: [20, 22, 24, 26, 28, 30], window: BASELINE_WINDOW });
      const followUpFacts = meanShots({ roundPrefix: 'post', rounds: 2, values: [10, 12, 14, 16, 18, 20], window: FOLLOW_UP_WINDOW });
      const result = computeComparableOpportunities(
        baseInput({ facts: [...baselineFacts, ...followUpFacts], outcome: meanOutcome }),
      );

      expect(result.baseline.value).toBeCloseTo(25, 5);
      expect(result.followUp.value).toBeCloseTo(15, 5);
      expect(result.baseline.unit).toBe('feet');
      expect(result.observedChange).toBeCloseTo(15 - 25, 5);
      expect(result.status).toBe('observed_change');
    });

    it('drops null-value candidates and records them under exclusions.missing_value', () => {
      // 6 matched shots, 2 of which have no usable proximity value.
      const followUpFacts = meanShots({
        roundPrefix: 'post',
        rounds: 2,
        values: [10, null, 12, 14, null, 16],
        window: FOLLOW_UP_WINDOW,
      });
      const baselineFacts = meanShots({ roundPrefix: 'base', rounds: 2, values: [20, 22, 24, 26, 28, 30], window: BASELINE_WINDOW });
      const result = computeComparableOpportunities(
        baseInput({ facts: [...baselineFacts, ...followUpFacts], outcome: meanOutcome }),
      );

      // Denominator/value reflect only the 4 shots with a real value.
      expect(result.followUp.denominator).toBe(4);
      expect(result.followUp.eligibleCount).toBe(4);
      expect(result.followUp.observedCount).toBe(4);
      expect(result.followUp.value).toBeCloseTo((10 + 12 + 14 + 16) / 4, 5);
      expect(result.followUp.exclusions.missing_value).toBe(2);
    });

    it('does not let a round that contributed no value satisfy the round floor (MUST 2)', () => {
      // Round "post-2" contributes ONLY a null-valued shot — it must not
      // count toward distinctRounds, even though a shot for it was matched.
      const followUpFacts = [
        approachShot({ round_id: 'post-0', hole_number: 1, shot_number: 2, observed_at: '2026-06-16T00:00:00.000Z', proximity_ft: 10 }),
        approachShot({ round_id: 'post-0', hole_number: 2, shot_number: 2, observed_at: '2026-06-16T01:00:00.000Z', proximity_ft: 12 }),
        approachShot({ round_id: 'post-1', hole_number: 1, shot_number: 2, observed_at: '2026-06-17T00:00:00.000Z', proximity_ft: 14 }),
        approachShot({ round_id: 'post-1', hole_number: 2, shot_number: 2, observed_at: '2026-06-17T01:00:00.000Z', proximity_ft: 16 }),
        approachShot({ round_id: 'post-1', hole_number: 3, shot_number: 2, observed_at: '2026-06-17T02:00:00.000Z', proximity_ft: 18 }),
        // post-2's only matched shot has no usable value.
        approachShot({ round_id: 'post-2', hole_number: 1, shot_number: 2, observed_at: '2026-06-18T00:00:00.000Z', proximity_ft: null }),
      ];
      const baselineFacts = meanShots({ roundPrefix: 'base', rounds: 2, values: [20, 22, 24, 26, 28, 30], window: BASELINE_WINDOW });
      const result = computeComparableOpportunities(
        baseInput({ facts: [...baselineFacts, ...followUpFacts], outcome: meanOutcome }),
      );

      // 5 contributing shots across only 2 rounds (post-0, post-1) —
      // post-2 contributed nothing, so it must not push distinctRounds to 3.
      expect(result.followUp.denominator).toBe(5);
      expect(result.followUp.distinctRounds).toBe(2);
      expect(result.followUp.status).toBe('supported');
      expect(result.followUp.exclusions.missing_value).toBe(1);
    });
  });
});
