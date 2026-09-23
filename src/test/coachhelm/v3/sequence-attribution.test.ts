/**
 * Pure-core tests for `attributeSequence` (addendum §13, work package A4,
 * slice 1). Reuses the A0 counterexample fixtures where they already cover
 * the case (`explicitPenaltyPair`, `incompleteShotSequence`, `par5Layup`,
 * `par3TeeGreenAttempt`, `aroundGreenHoleOut`) and adds fixtures purpose-
 * built to exercise all three named §7.3 views (including their chained
 * forms — repeated recovery shots, a 3-putt's third putt), the conservation
 * identity, and the canonical baseline's exact behavior (green-distance
 * anchors, the unmapped-lie fairway fallback, missing-lie vs.
 * missing-distance gaps). No DB, no adapters.
 */
import { describe, it, expect } from 'vitest';
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import { normalizeShot, type RawShotInput } from '@/lib/coachhelm/v3/context/normalize-shot';
import type { HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import {
  attributeSequence,
  computeSequenceAttribution,
  SEQUENCE_MIN_EVENTS,
} from '@/lib/coachhelm/v3/metrics/sequence-attribution';
import {
  aroundGreenHoleOut,
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
  yardage: null,
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

describe('attributeSequence — a chip-in holes out from off the green (aroundGreenHoleOut)', () => {
  it('absorbs the chip-in into the same approach_to_recovery chain as the miss', () => {
    const hole = aroundGreenHoleOut.holes[0]!;
    const facts = factsFor(aroundGreenHoleOut.rawShots);
    const result = attributeSequence(facts, hole, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual(['tee_to_next', 'approach_to_recovery']);
    expect(result.events.map((e) => e.shotNumbers)).toEqual([[1], [2, 3]]);
    assertPartitionsAllShots(result.events, hole);

    // No putt was ever recorded (the fixture's whole point) — nothing in
    // the partition should be a putting kind.
    expect(result.events.some((e) => e.kind === 'first_putt_to_next_putt')).toBe(false);
    expect(result.events.some((e) => e.kind === 'putting_sequence')).toBe(false);

    const expectedStart = getExpectedStrokes('tee', 380);
    expect(result.totalMeasuredContribution).not.toBeNull();
    expect(result.totalMeasuredContribution!).toBeCloseTo(expectedStart - hole.total_strokes, 10);
  });
});

// ---------------------------------------------------------------------------
// Hole-in-one: a single tee shot that holes out directly on a par 3.
// ---------------------------------------------------------------------------
const HOLE_IN_ONE_HOLE: HoleContext = {
  round_id: 'round-ace',
  course_id: 'course-ace',
  hole_number: 6,
  par: 3,
  total_strokes: 1,
  penalty_strokes: 0,
  putts: 0,
  gir: true,
  yardage: null,
};
const HOLE_IN_ONE_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-ace',
    hole_number: 6,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'non_driver',
    distance_to_hole_before: 175,
    distance_unit_before: 'yards',
    distance_to_hole_after: 0,
    distance_unit_after: 'feet',
    lie_before: 'tee',
    lie_after: 'hole',
    result: 'hole',
    is_penalty: false,
    putt_made: null,
    intent: 'go_for_green',
    observed_at: '2026-07-10T09:00:00.000Z',
  },
];

describe('attributeSequence — a hole-in-one is a single, fully resolved event', () => {
  it('does not require a second shot for the partition or the conservation identity', () => {
    const facts = factsFor(HOLE_IN_ONE_RAW_SHOTS);
    const result = attributeSequence(facts, HOLE_IN_ONE_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.shotNumbers).toEqual([1]);
    expect(result.events[0]!.measuredContribution).not.toBeNull();
    expect(result.events[0]!.baselineGap).toBeNull();
    assertPartitionsAllShots(result.events, HOLE_IN_ONE_HOLE);

    const expectedStart = getExpectedStrokes('tee', 175);
    expect(result.totalMeasuredContribution).toBeCloseTo(expectedStart - 1, 10);
    expect(result.lostStrokesVsPar).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// A genuine 3-putt: putt 1 leaves a mid-range putt, putt 2 misses short,
// putt 3 holes. The approach's own BEFORE lie is an unmapped string
// ('other') to also prove the canonical engine's fairway fallback resolves
// it instead of reporting a gap.
// ---------------------------------------------------------------------------
const THREE_PUTT_HOLE: HoleContext = {
  round_id: 'round-3putt',
  course_id: 'course-3putt',
  hole_number: 11,
  par: 4,
  total_strokes: 5,
  penalty_strokes: 0,
  putts: 3,
  gir: true,
  yardage: null,
};
const THREE_PUTT_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-3putt',
    hole_number: 11,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    distance_to_hole_before: 400,
    distance_unit_before: 'yards',
    distance_to_hole_after: 150,
    distance_unit_after: 'yards',
    lie_before: 'tee',
    lie_after: 'other',
    result: 'other',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-12T13:00:00.000Z',
  },
  {
    round_id: 'round-3putt',
    hole_number: 11,
    shot_number: 2,
    shot_type: 'approach',
    club_type: 'non_driver',
    // Unmapped lie ('other', not 'fairway'/'rough'/'sand'/'tee'/'green') —
    // must resolve via the canonical fairway fallback, not a baselineGap.
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 10,
    distance_unit_after: 'feet',
    lie_before: 'other',
    lie_after: 'green',
    result: 'green',
    is_penalty: false,
    putt_made: null,
    intent: 'go_for_green',
    observed_at: '2026-07-12T13:03:00.000Z',
  },
  {
    round_id: 'round-3putt',
    hole_number: 11,
    shot_number: 3,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 10,
    distance_unit_before: 'feet',
    distance_to_hole_after: 6,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'green',
    result: null,
    is_penalty: false,
    putt_made: null,
    intent: 'putt',
    observed_at: '2026-07-12T13:05:00.000Z',
  },
  {
    round_id: 'round-3putt',
    hole_number: 11,
    shot_number: 4,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 6,
    distance_unit_before: 'feet',
    distance_to_hole_after: 2,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'green',
    result: null,
    is_penalty: false,
    putt_made: null,
    intent: 'putt',
    observed_at: '2026-07-12T13:06:00.000Z',
  },
  {
    round_id: 'round-3putt',
    hole_number: 11,
    shot_number: 5,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 2,
    distance_unit_before: 'feet',
    distance_to_hole_after: 0,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'hole',
    result: 'hole',
    is_penalty: false,
    putt_made: true,
    intent: 'putt',
    observed_at: '2026-07-12T13:07:00.000Z',
  },
];

describe('attributeSequence — a genuine 3-putt puts the third putt in putting_sequence, not other', () => {
  it('gives the first putt its own event and chains putts 2+3 into one putting_sequence', () => {
    const facts = factsFor(THREE_PUTT_RAW_SHOTS);
    const result = attributeSequence(facts, THREE_PUTT_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual([
      'tee_to_next',
      'other',
      'first_putt_to_next_putt',
      'putting_sequence',
    ]);
    expect(result.events.map((e) => e.shotNumbers)).toEqual([[1], [2], [3], [4, 5]]);
    assertPartitionsAllShots(result.events, THREE_PUTT_HOLE);

    // Shot 2's unmapped 'other' before-lie still resolves (fairway fallback).
    const approachEvent = result.events.find((e) => e.shotNumbers.includes(2))!;
    expect(approachEvent.measuredContribution).not.toBeNull();
    expect(approachEvent.baselineGap).toBeNull();

    for (const event of result.events) {
      expect(event.measuredContribution).not.toBeNull();
    }
    const expectedStart = getExpectedStrokes('tee', 400);
    expect(result.totalMeasuredContribution).toBeCloseTo(
      expectedStart - THREE_PUTT_HOLE.total_strokes,
      10,
    );
  });
});

// ---------------------------------------------------------------------------
// Repeated failed recovery: TWO recovery attempts (not just one) before the
// ball finally reaches the green. Proves the approach_to_recovery chain
// extends past a single follow-up shot instead of dropping the second
// recovery attempt into 'other'.
// ---------------------------------------------------------------------------
const REPEATED_RECOVERY_HOLE: HoleContext = {
  round_id: 'round-recovery',
  course_id: 'course-recovery',
  hole_number: 14,
  par: 4,
  total_strokes: 5,
  penalty_strokes: 0,
  putts: 1,
  gir: false,
  yardage: null,
};
const REPEATED_RECOVERY_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-recovery',
    hole_number: 14,
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
    observed_at: '2026-07-15T08:00:00.000Z',
  },
  {
    round_id: 'round-recovery',
    hole_number: 14,
    shot_number: 2,
    shot_type: 'approach',
    club_type: 'non_driver',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 75,
    distance_unit_after: 'feet',
    lie_before: 'fairway',
    lie_after: 'rough',
    result: 'rough',
    is_penalty: false,
    putt_made: null,
    intent: 'go_for_green',
    observed_at: '2026-07-15T08:03:00.000Z',
  },
  {
    round_id: 'round-recovery',
    hole_number: 14,
    shot_number: 3,
    shot_type: 'around_green',
    club_type: 'non_driver',
    // First recovery attempt — still short of the green.
    distance_to_hole_before: 75,
    distance_unit_before: 'feet',
    distance_to_hole_after: 30,
    distance_unit_after: 'feet',
    lie_before: 'rough',
    lie_after: 'rough',
    result: 'rough',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-15T08:05:00.000Z',
  },
  {
    round_id: 'round-recovery',
    hole_number: 14,
    shot_number: 4,
    shot_type: 'around_green',
    club_type: 'non_driver',
    // Second recovery attempt — finally reaches the green.
    distance_to_hole_before: 30,
    distance_unit_before: 'feet',
    distance_to_hole_after: 3,
    distance_unit_after: 'feet',
    lie_before: 'rough',
    lie_after: 'green',
    result: 'green',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-15T08:07:00.000Z',
  },
  {
    round_id: 'round-recovery',
    hole_number: 14,
    shot_number: 5,
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
    observed_at: '2026-07-15T08:08:00.000Z',
  },
];

describe('attributeSequence — repeated recovery shots chain into one approach_to_recovery event', () => {
  it('absorbs both recovery attempts, not just the first, into the same chain', () => {
    const facts = factsFor(REPEATED_RECOVERY_RAW_SHOTS);
    const result = attributeSequence(facts, REPEATED_RECOVERY_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual([
      'tee_to_next',
      'approach_to_recovery',
      'first_putt_to_next_putt',
    ]);
    // The chain covers the miss (2) AND both recovery attempts (3, 4) — not
    // just [2, 3] with shot 4 dropped into 'other'.
    expect(result.events.map((e) => e.shotNumbers)).toEqual([[1], [2, 3, 4], [5]]);
    assertPartitionsAllShots(result.events, REPEATED_RECOVERY_HOLE);

    for (const event of result.events) {
      expect(event.measuredContribution).not.toBeNull();
    }
    const expectedStart = getExpectedStrokes('tee', 380);
    expect(result.totalMeasuredContribution).toBeCloseTo(
      expectedStart - REPEATED_RECOVERY_HOLE.total_strokes,
      10,
    );
  });
});

// ---------------------------------------------------------------------------
// Stroke-and-distance OB re-tee: the original tee shot is itself the
// penalty (before and after both the SAME tee distance — "stroke and
// distance" replays from the identical spot), followed by a fresh, distinct
// tee shot from the same marker. Proves the penalty resolves to a clean,
// fully-measured contribution (not just the null/missing-data path
// explicitPenaltyPair already covers) and that the re-tee swing is its own
// tee_to_next event, never double-counted with the penalty.
// ---------------------------------------------------------------------------
const OB_RETEE_HOLE: HoleContext = {
  round_id: 'round-ob-retee',
  course_id: 'course-ob-retee',
  hole_number: 16,
  par: 4,
  total_strokes: 4,
  penalty_strokes: 1,
  putts: 1,
  gir: false,
  yardage: null,
};
const OB_RETEE_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-ob-retee',
    hole_number: 16,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    // Stroke and distance: the ball is OB, so the replay is from the exact
    // same tee position — before and after are the same distance/lie.
    distance_to_hole_before: 400,
    distance_unit_before: 'yards',
    distance_to_hole_after: 400,
    distance_unit_after: 'yards',
    lie_before: 'tee',
    lie_after: 'tee',
    result: null,
    is_penalty: true,
    putt_made: null,
    observed_at: '2026-07-18T07:00:00.000Z',
  },
  {
    round_id: 'round-ob-retee',
    hole_number: 16,
    shot_number: 2,
    shot_type: 'tee',
    club_type: 'driver',
    distance_to_hole_before: 400,
    distance_unit_before: 'yards',
    distance_to_hole_after: 150,
    distance_unit_after: 'yards',
    lie_before: 'tee',
    lie_after: 'fairway',
    result: 'fairway',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-18T07:01:00.000Z',
  },
  {
    round_id: 'round-ob-retee',
    hole_number: 16,
    shot_number: 3,
    shot_type: 'approach',
    club_type: 'non_driver',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 10,
    distance_unit_after: 'feet',
    lie_before: 'fairway',
    lie_after: 'green',
    result: 'green',
    is_penalty: false,
    putt_made: null,
    intent: 'go_for_green',
    observed_at: '2026-07-18T07:04:00.000Z',
  },
  {
    round_id: 'round-ob-retee',
    hole_number: 16,
    shot_number: 4,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 10,
    distance_unit_before: 'feet',
    distance_to_hole_after: 0,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'hole',
    result: 'hole',
    is_penalty: false,
    putt_made: true,
    intent: 'putt',
    observed_at: '2026-07-18T07:06:00.000Z',
  },
];

describe('attributeSequence — stroke-and-distance OB re-tee', () => {
  it('resolves the penalty to a clean -1 and gives the re-tee its own tee_to_next event', () => {
    const facts = factsFor(OB_RETEE_RAW_SHOTS);
    const result = attributeSequence(facts, OB_RETEE_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual([
      'penalty',
      'tee_to_next',
      'other',
      'first_putt_to_next_putt',
    ]);
    expect(result.events.map((e) => e.shotNumbers)).toEqual([[1], [2], [3], [4]]);
    assertPartitionsAllShots(result.events, OB_RETEE_HOLE);

    const penaltyEvent = result.events[0]!;
    expect(penaltyEvent.isPenalty).toBe(true);
    // Same before/after distance and lie — expected-strokes cancels exactly,
    // leaving just the -1 stroke charge. Not the null/missing-data shape
    // explicitPenaltyPair covers.
    expect(penaltyEvent.baselineGap).toBeNull();
    expect(penaltyEvent.measuredContribution).toBeCloseTo(-1, 10);

    const retreeEvent = result.events[1]!;
    expect(retreeEvent.isPenalty).toBe(false);
    expect(retreeEvent.measuredContribution).not.toBeNull();

    const expectedStart = getExpectedStrokes('tee', 400);
    expect(result.totalMeasuredContribution).toBeCloseTo(
      expectedStart - OB_RETEE_HOLE.total_strokes,
      10,
    );
  });
});

// ---------------------------------------------------------------------------
// A missing BEFORE distance with a KNOWN after-distance: measuredContribution
// must be null (can't compute without a start point), but heuristicScore
// must still surface the known ending leave distance rather than also
// coming back null. Not a realistic scorecard — a minimal, purpose-built
// case isolating this one behavior.
// ---------------------------------------------------------------------------
const HEURISTIC_GAP_HOLE: HoleContext = {
  round_id: 'round-heuristic-gap',
  course_id: 'course-heuristic-gap',
  hole_number: 2,
  par: 4,
  total_strokes: 2,
  penalty_strokes: 0,
  putts: 1,
  gir: true,
  yardage: null,
};
const HEURISTIC_GAP_RAW_SHOTS: RawShotInput[] = [
  {
    round_id: 'round-heuristic-gap',
    hole_number: 2,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    // Before-distance never captured (ingest glitch) — after-distance is.
    distance_to_hole_before: null,
    distance_unit_before: null,
    distance_to_hole_after: 15,
    distance_unit_after: 'feet',
    lie_before: 'tee',
    lie_after: 'green',
    result: 'green',
    is_penalty: false,
    putt_made: null,
    observed_at: '2026-07-20T06:00:00.000Z',
  },
  {
    round_id: 'round-heuristic-gap',
    hole_number: 2,
    shot_number: 2,
    shot_type: 'putting',
    club_type: 'putter',
    distance_to_hole_before: 15,
    distance_unit_before: 'feet',
    distance_to_hole_after: 0,
    distance_unit_after: 'feet',
    lie_before: 'green',
    lie_after: 'hole',
    result: 'hole',
    is_penalty: false,
    putt_made: true,
    intent: 'putt',
    observed_at: '2026-07-20T06:01:00.000Z',
  },
];

describe('attributeSequence — a missing before-distance still surfaces a non-null heuristicScore', () => {
  it('reports the gap on the tee event but not on the resolved putt event', () => {
    const facts = factsFor(HEURISTIC_GAP_RAW_SHOTS);
    const result = attributeSequence(facts, HEURISTIC_GAP_HOLE, SCOPE);

    expect(result.status).toBe('attributed');
    expect(result.events.map((e) => e.kind)).toEqual(['tee_to_next', 'first_putt_to_next_putt']);
    assertPartitionsAllShots(result.events, HEURISTIC_GAP_HOLE);

    const teeEvent = result.events[0]!;
    expect(teeEvent.measuredContribution).toBeNull();
    expect(teeEvent.baselineGap).toBe('missing_distance');
    // The known ending leave distance (15ft, an exact green-table anchor —
    // 1.78 — which also proves distanceFeet is passed straight through with
    // no feet→yards round trip) still comes back, even though the event's
    // own contribution could not be computed.
    expect(teeEvent.heuristicScore).toBe(15);

    const puttEvent = result.events[1]!;
    expect(puttEvent.measuredContribution).not.toBeNull();
    expect(puttEvent.measuredContribution).toBeCloseTo(1.78 - 0 - 1, 10);
    expect(puttEvent.baselineGap).toBeNull();
    expect(puttEvent.heuristicScore).toBeNull();

    expect(result.totalMeasuredContribution).toBeNull();
    expect(result.exclusions).toEqual({ missing_distance: 1 });
  });
});

// ---------------------------------------------------------------------------
// computeSequenceAttribution (addendum §13, A4 slice 2) — the scope-wide
// MetricResult[] rollup. Reuses this file's own per-hole fixtures rather
// than inventing new ones: CONSERVATION_HOLE (every event resolved),
// incompleteShotSequence (suppressed), explicitPenaltyPair (a resolved
// population and a null/gap population on the SAME hole).
// ---------------------------------------------------------------------------
describe('computeSequenceAttribution — conservation and the insufficient-but-real-value case', () => {
  it('sums one attributed hole into per-kind rows whose numerator/value match the single event, each below the events floor', () => {
    const facts = factsFor(CONSERVATION_RAW_SHOTS);
    const rows = computeSequenceAttribution(facts, [CONSERVATION_HOLE], SCOPE);

    const perHole = attributeSequence(facts, CONSERVATION_HOLE, SCOPE);
    expect(perHole.status).toBe('attributed');

    for (const kind of ['tee_to_next', 'approach_to_recovery', 'first_putt_to_next_putt'] as const) {
      const row = rows.find((r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === kind);
      expect(row).toBeDefined();
      const matching = perHole.events.filter((e) => e.kind === kind);
      expect(matching).toHaveLength(1);
      expect(row!.denominator).toBe(1);
      expect(row!.denominator).toBeLessThan(SEQUENCE_MIN_EVENTS);
      // Below the floor, but the real value is still reported, never hidden.
      expect(row!.status).toBe('insufficient');
      expect(row!.value).not.toBeNull();
      expect(row!.numerator).toBeCloseTo(matching[0]!.measuredContribution!, 10);
      expect(row!.value).toBeCloseTo(matching[0]!.measuredContribution!, 10);
      expect(row!.exclusions).toEqual({});
    }
  });

  it('gives every kind that never occurred on any hole a zero-denominator, null-value invalid row', () => {
    const facts = factsFor(CONSERVATION_RAW_SHOTS);
    const rows = computeSequenceAttribution(facts, [CONSERVATION_HOLE], SCOPE);

    for (const kind of ['putting_sequence', 'penalty', 'other'] as const) {
      const row = rows.find((r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === kind);
      expect(row).toBeDefined();
      expect(row!.denominator).toBe(0);
      expect(row!.value).toBeNull();
      expect(row!.numerator).toBeNull();
      expect(row!.status).toBe('invalid');
    }
  });

  it('reports a real, non-null coverage value even though it is below the holes floor', () => {
    const facts = factsFor(CONSERVATION_RAW_SHOTS);
    const rows = computeSequenceAttribution(facts, [CONSERVATION_HOLE], SCOPE);

    const coverage = rows.find((r) => r.metricId === 'sequence_hole_coverage')!;
    expect(coverage.dimensions).toEqual({});
    expect(coverage.value).toBe(1);
    expect(coverage.denominator).toBe(1);
    expect(coverage.observedCount).toBe(1);
    expect(coverage.distinctRounds).toBe(1);
    expect(coverage.status).toBe('insufficient'); // 1 attributed hole < SEQUENCE_MIN_HOLES
    expect(coverage.exclusions).toEqual({});
  });
});

describe('computeSequenceAttribution — a suppressed hole contributes no events but is still counted', () => {
  it('excludes the suppressed hole from every per-kind row while naming its reasons on the coverage row', () => {
    const suppressedHole = incompleteShotSequence.holes[0]!;
    const facts = [
      ...factsFor(CONSERVATION_RAW_SHOTS),
      ...factsFor(incompleteShotSequence.rawShots),
    ];
    const rows = computeSequenceAttribution(facts, [CONSERVATION_HOLE, suppressedHole], SCOPE);

    const perHoleSuppressed = attributeSequence(factsFor(incompleteShotSequence.rawShots), suppressedHole, SCOPE);
    expect(perHoleSuppressed.status).toBe('suppressed');

    // The suppressed hole's round contributes zero events to any kind — the
    // conservation hole's single events are all that appear.
    for (const kind of ['tee_to_next', 'approach_to_recovery', 'first_putt_to_next_putt'] as const) {
      const row = rows.find((r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === kind)!;
      expect(row.denominator).toBe(1);
      expect(row.distinctRounds).toBe(1);
    }

    const coverage = rows.find((r) => r.metricId === 'sequence_hole_coverage')!;
    // Both holes are visible in observedCount; only the attributed one counts
    // toward value/denominator.
    expect(coverage.observedCount).toBe(2);
    expect(coverage.value).toBe(1);
    expect(coverage.denominator).toBe(1);
    for (const reason of perHoleSuppressed.reasons) {
      expect(coverage.exclusions[reason]).toBe(1);
    }
  });
});

describe('computeSequenceAttribution — an unresolved (gap) event lands in exclusions, never the denominator', () => {
  it('keeps the penalty row at a zero denominator while naming the gap reason and count', () => {
    const hole = explicitPenaltyPair.holes[0]!;
    const facts = factsFor(explicitPenaltyPair.rawShots);
    const rows = computeSequenceAttribution(facts, [hole], SCOPE);

    const perHole = attributeSequence(facts, hole, SCOPE);
    const penaltyEvents = perHole.events.filter((e) => e.kind === 'penalty');
    expect(penaltyEvents).toHaveLength(2);
    for (const event of penaltyEvents) {
      expect(event.measuredContribution).toBeNull();
      expect(event.baselineGap).toBe('missing_distance');
    }

    const penaltyRow = rows.find((r) => r.metricId === 'sequence_event_strokes_gained' && r.dimensions.event_kind === 'penalty')!;
    expect(penaltyRow.denominator).toBe(0);
    expect(penaltyRow.value).toBeNull();
    expect(penaltyRow.numerator).toBeNull();
    expect(penaltyRow.status).toBe('invalid');
    // Both gap events are still visible in the wider population...
    expect(penaltyRow.observedCount).toBe(2);
    // ...but named as exclusions, never smuggled into the denominator.
    expect(penaltyRow.exclusions).toEqual({ missing_distance: 2 });
  });
});
