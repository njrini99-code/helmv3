/**
 * Pure-core tests for `attributeSequence` (addendum §13, work package A4,
 * slice 1). Reuses the A0 counterexample fixtures where they already cover
 * the case (`explicitPenaltyPair`, `incompleteShotSequence`, `par5Layup`,
 * `par3TeeGreenAttempt`) and adds one new fixture purpose-built to exercise
 * all three named §7.3 views plus the conservation identity in a single
 * hole. No DB, no adapters.
 */
import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/golf/strokes-gained';
import { normalizeShot, type RawShotInput } from '@/lib/coachhelm/v3/context/normalize-shot';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import { attributeSequence } from '@/lib/coachhelm/v3/metrics/sequence-attribution';
import {
  explicitPenaltyPair,
  incompleteShotSequence,
  par3TeeGreenAttempt,
  par5Layup,
} from './fixtures/situational-intelligence';

function factsFor(rawShots: readonly RawShotInput[]): ShotFact[] {
  return rawShots.map(normalizeShot);
}

const SCOPE = {
  player_id: 'player-sequence-attribution',
  window_start: '2026-05-01',
  window_end: '2026-07-31',
  analysis_cutoff: '2026-08-01T00:00:00.000Z',
};

/** Every shot on the hole belongs to exactly one event: no gaps, no
 *  duplicates. The structural invariant the whole partition depends on. */
function assertPartitionsAllShots(events: { shotNumbers: number[] }[], hole: HoleContext): void {
  const covered = events.flatMap((e) => e.shotNumbers).sort((a, b) => a - b);
  const expected = Array.from({ length: hole.total_strokes }, (_, i) => i + 1);
  expect(covered).toEqual(expected);
}

// ---------------------------------------------------------------------------
// A new fixture exercising all three §7.3 views in one complete hole: a tee
// shot, an approach that misses the green, an around-green recovery that
// finds it, and a single putt that holes out.
// ---------------------------------------------------------------------------
const CONSERVATION_HOLE: HoleContext = {
  round_id: 'round-conservation',
  course_id: 'course-seq',
  hole_number: 1,
  par: 4,
  total_strokes: 4,
  penalty_strokes: 0,
  putts: 1,
  gir: false,
};
const CONSERVATION_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-conservation',
    hole_number: 1,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    distance_to_hole_before: 380,
    distance_unit_before: 'yards',
    distance_to_hole_after: 150,
    distance_unit_after: 'yards',
    lie_before: 'tee',
    lie_after: 'fairway',
    result: 'fairway',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-06-01T10:00:00.000Z',
  },
  {
    round_id: 'round-conservation',
    hole_number: 1,
    shot_number: 2,
    shot_type: 'approach',
    club_type: 'non_driver',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 30,
    distance_unit_after: 'feet',
    lie_before: 'fairway',
    lie_after: 'rough',
    result: 'rough',
    is_penalty: false,
    putt_made: null,
    intent: 'go_for_green',
    observed_at: '2026-06-01T10:03:00.000Z',
  },
  {
    round_id: 'round-conservation',
    hole_number: 1,
    shot_number: 3,
    shot_type: 'around_green',
    club_type: 'non_driver',
    distance_to_hole_before: 30,
    distance_unit_before: 'feet',
    distance_to_hole_after: 3,
    distance_unit_after: 'feet',
    lie_before: 'rough',
    lie_after: 'green',
    result: 'green',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-06-01T10:05:00.000Z',
  },
  {
    round_id: 'round-conservation',
    hole_number: 1,
    shot_number: 4,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 3,
    distance_unit_before: 'feet',
    distance_to_hole_after: 0,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'hole',
    result: 'hole',
    is_penalty: false,
    putt_made: true,
    intent: 'putt',
    observed_at: '2026-06-01T10:07:00.000Z',
  },
];

describe('attributeSequence — complete-hole conservation', () => {
  it('sums every event to expected-strokes-at-start minus actual strokes taken', () => {
    const facts = factsFor(CONSERVATION_RAW_SHOTS);
    const result = attributeSequence(facts, CONSERVATION_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual([
      'tee_to_next',
      'approach_to_recovery',
      'first_putt_to_next_putt',
    ]);
    expect(result.events.map((e) => e.shotNumbers)).toEqual([[1], [2, 3], [4]]);
    // Every event resolved — none fell back to a heuristic score.
    for (const event of result.events) {
      expect(event.measuredContribution).not.toBeNull();
      expect(event.heuristicScore).toBeNull();
      expect(event.baselineGap).toBeNull();
    }

    const expectedStart = getExpectedStrokes('tee', 380);
    expect(result.totalMeasuredContribution).not.toBeNull();
    expect(result.totalMeasuredContribution!).toBeCloseTo(
      expectedStart - CONSERVATION_HOLE.total_strokes,
      10,
    );
    expect(result.lostStrokesVsPar).toBe(0); // par round
    expect(result.exclusions).toEqual({});
  });

  it('never assigns a shot to more than one event, and drops none', () => {
    const facts = factsFor(CONSERVATION_RAW_SHOTS);
    const result = attributeSequence(facts, CONSERVATION_HOLE, SCOPE);
    assertPartitionsAllShots(result.events, CONSERVATION_HOLE);
  });
});

describe('attributeSequence — explicit penalty stays its own event, never charged twice', () => {
  const hole = explicitPenaltyPair.holes[0]!;

  it('gives each penalty shot its own singleton event, distinct from its neighbors', () => {
    const facts = factsFor(explicitPenaltyPair.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    expect(result.status).toBe('attributed');
    const penaltyEvents = result.events.filter((e) => e.kind === 'penalty');
    expect(penaltyEvents).toHaveLength(2);
    expect(penaltyEvents.map((e) => e.shotNumbers)).toEqual([[2], [3]]);
    for (const event of penaltyEvents) {
      expect(event.isPenalty).toBe(true);
    }
    // Neither the tee event nor the shot-4 event absorbed a penalty shot.
    for (const event of result.events) {
      if (event.kind !== 'penalty') {
        expect(event.isPenalty).toBe(false);
      }
    }
  });

  it('falls back to counts and lost-strokes-vs-par when a penalty leaves no usable after-distance', () => {
    // Both penalty rows in this fixture record `distance_to_hole_after:
    // null` — the ball was lost in the hazard, a genuinely missing
    // measurement (fixture comment: "no usable after-distance"). Neither
    // penalty event can resolve a measured contribution, so the hole-level
    // total must not silently sum only the resolved events.
    const facts = factsFor(explicitPenaltyPair.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    const penaltyEvents = result.events.filter((e) => e.kind === 'penalty');
    for (const event of penaltyEvents) {
      expect(event.measuredContribution).toBeNull();
      expect(event.baselineGap).toBe('missing_distance');
    }
    expect(result.totalMeasuredContribution).toBeNull();
    expect(result.exclusions).toEqual({ missing_distance: 2 });
    // Still available — it only reads the hole's authoritative totals.
    expect(result.lostStrokesVsPar).toBe(hole.total_strokes - hole.par);
    expect(result.lostStrokesVsPar).toBe(1);
  });

  it('never assigns a shot to more than one event, and drops none', () => {
    const facts = factsFor(explicitPenaltyPair.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);
    assertPartitionsAllShots(result.events, hole);
  });
});

describe('attributeSequence — incomplete sequence is suppressed, never a partial total', () => {
  it('returns status suppressed with buildHoleSequence reasons, no events, no total', () => {
    const hole = incompleteShotSequence.holes[0]!;
    const facts = factsFor(incompleteShotSequence.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    expect(result.status).toBe('suppressed');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['shot_count_mismatch', 'sequence_not_terminated']),
    );
    expect(result.events).toEqual([]);
    expect(result.totalMeasuredContribution).toBeNull();
    // Par-total fallback stays available even when the shot sequence itself
    // can't be trusted (addendum §14.1: "Missing shot with completed
    // scorecard → par total may remain valid; full sequence attribution
    // unavailable").
    expect(result.lostStrokesVsPar).toBe(hole.total_strokes - hole.par);
    expect(result.lostStrokesVsPar).toBe(0);
  });
});

describe('attributeSequence — an explicitly tagged lay-up is not mistaken for a missed-green recovery', () => {
  it('does not pair the lay-up with the following shot', () => {
    const hole = par5Layup.holes[0]!;
    const facts = factsFor(par5Layup.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    expect(result.status).toBe('attributed');
    const layupEvent = result.events.find((e) => e.shotNumbers.includes(2));
    expect(layupEvent).toBeDefined();
    expect(layupEvent!.kind).toBe('other');
    expect(layupEvent!.shotNumbers).toEqual([2]); // not paired with shot 3
    expect(result.events.some((e) => e.kind === 'approach_to_recovery')).toBe(false);

    // Bonus: this fixture's every shot has a known lie/distance, so the
    // conservation identity still holds even though no named view fired
    // for shot 2.
    const expectedStart = getExpectedStrokes('tee', 560);
    expect(result.totalMeasuredContribution).not.toBeNull();
    expect(result.totalMeasuredContribution!).toBeCloseTo(
      expectedStart - hole.total_strokes,
      10,
    );
  });
});

describe('attributeSequence — a par-3 tee shot is the green attempt, not a tee_to_next event', () => {
  it('does not classify the tee shot as tee_to_next', () => {
    const hole = par3TeeGreenAttempt.holes[0]!;
    const facts = factsFor(par3TeeGreenAttempt.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    expect(result.status).toBe('attributed');
    const teeEvent = result.events.find((e) => e.shotNumbers.includes(1));
    expect(teeEvent).toBeDefined();
    expect(teeEvent!.kind).not.toBe('tee_to_next');
    expect(teeEvent!.kind).not.toBe('approach_to_recovery'); // it found the green
    expect(teeEvent!.kind).toBe('other');
  });
});
