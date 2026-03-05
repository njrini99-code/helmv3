/**
 * Shared test fixtures for golf shot tracking & stats tests.
 * Factory functions produce objects with sensible defaults that can be overridden.
 */
import type { ShotRecord, RoundHole } from '@/lib/types/golf';
import type { RawShot, HoleInfo, RoundInfo } from '@/lib/utils/golf-stats-calculator-shots';

// ============================================================================
// FACTORY: ShotRecord (client-side shot)
// ============================================================================

let shotCounter = 0;

export function makeShotRecord(overrides: Partial<ShotRecord> = {}): ShotRecord {
  shotCounter++;
  return {
    id: `shot-${shotCounter}`,
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    shotDistance: 250,
    isPenalty: false,
    ...overrides,
  };
}

// ============================================================================
// FACTORY: RawShot (database-level shot)
// ============================================================================

let rawShotCounter = 0;

export function makeRawShot(overrides: Partial<RawShot> = {}): RawShot {
  rawShotCounter++;
  return {
    id: `raw-shot-${rawShotCounter}`,
    round_id: 'round-1',
    hole_number: 1,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    lie_before: 'tee',
    distance_to_hole_before: 400,
    distance_unit_before: 'yards',
    result: 'fairway',
    distance_to_hole_after: 150,
    distance_unit_after: 'yards',
    shot_distance: 250,
    miss_direction: null,
    putt_break: null,
    putt_distance_feet: null,
    putt_slope: null,
    is_penalty: false,
    ...overrides,
  };
}

// ============================================================================
// FACTORY: HoleInfo & RoundInfo
// ============================================================================

export function makeHoleInfo(overrides: Partial<HoleInfo> = {}): HoleInfo {
  return {
    round_id: 'round-1',
    hole_number: 1,
    par: 4,
    yardage: 400,
    ...overrides,
  };
}

export function makeRoundInfo(overrides: Partial<RoundInfo> = {}): RoundInfo {
  return {
    id: 'round-1',
    round_date: '2026-03-01',
    course_name: 'Test Course',
    round_type: 'practice',
    course_par: 72,
    holes_played: 18,
    ...overrides,
  };
}

export function makeRoundHole(overrides: Partial<RoundHole> = {}): RoundHole {
  return {
    number: 1,
    par: 4,
    yardage: 400,
    score: null,
    ...overrides,
  };
}

// ============================================================================
// PRESET SCENARIOS (RawShot arrays for stats calculator tests)
// ============================================================================

/** Par 4 birdie: tee→fairway, approach→green, 1 putt → hole */
export function par4BirdieRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards',
      shot_distance: 250,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet',
      shot_distance: 150,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_break: 'left_to_right', putt_slope: 'uphill',
      putt_distance_feet: 10, putt_made: true,
    }),
  ];
}

/** Par 4 bogey: tee→rough, approach→miss GIR (rough), chip→green, 2 putts */
export function par4BogeyRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'rough', distance_to_hole_after: 160, distance_unit_after: 'yards',
      shot_distance: 240, miss_direction: 'right',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'rough', distance_to_hole_before: 160, distance_unit_before: 'yards',
      result: 'rough', distance_to_hole_after: 30, distance_unit_after: 'yards',
      shot_distance: 130, miss_direction: 'short',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'around_green', club_type: 'non_driver',
      lie_before: 'rough', distance_to_hole_before: 30, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 15, distance_unit_after: 'feet',
      shot_distance: 30,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 4, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 15, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet',
      shot_distance: 0, putt_break: 'right_to_left', putt_slope: 'downhill',
      putt_distance_feet: 15, putt_made: false,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 5, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 2, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 2, putt_made: true,
    }),
  ];
}

/** Par 3 GIR: tee/approach→green, 2 putts → par */
export function par3GirRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'non_driver',
      lie_before: 'tee', distance_to_hole_before: 180, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet',
      shot_distance: 180,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 20, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: 3, distance_unit_after: 'feet',
      shot_distance: 0, putt_break: 'straight', putt_slope: 'level',
      putt_distance_feet: 20, putt_made: false,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 3, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 3, putt_made: true,
    }),
  ];
}

/** Sand save: tee→fairway, approach→sand, sand shot→green, 1 putt → par */
export function sandSaveRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards',
      shot_distance: 250,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'sand', distance_to_hole_after: 20, distance_unit_after: 'yards',
      shot_distance: 130, miss_direction: 'right',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'around_green', club_type: 'non_driver',
      lie_before: 'sand', distance_to_hole_before: 20, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 5, distance_unit_after: 'feet',
      shot_distance: 20,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 4, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 5, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 5, putt_made: true,
    }),
  ];
}

/** Three-putt: tee→fairway, approach→green, 3 putts → bogey on par 4 */
export function threePuttRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards',
      shot_distance: 250,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 40, distance_unit_after: 'feet',
      shot_distance: 150,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 40, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: 8, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 40, putt_made: false,
      putt_break: 'left_to_right', putt_slope: 'downhill',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 4, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 8, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 8, putt_made: false,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 5, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 2, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 2, putt_made: true,
    }),
  ];
}

/** Par 5 with penalty: tee→fairway, OB penalty, approach→green, 2 putts → 7 (double bogey) */
export function par5WithPenaltyRawShots(holeNumber = 1): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', club_type: 'driver',
      lie_before: 'tee', distance_to_hole_before: 540, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 260, distance_unit_after: 'yards',
      shot_distance: 280,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'penalty', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 260, distance_unit_before: 'yards',
      result: 'penalty', distance_to_hole_after: 260, distance_unit_after: 'yards',
      shot_distance: 0, is_penalty: true, penalty_type: 'ob',
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 260, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 80, distance_unit_after: 'yards',
      shot_distance: 180,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 4, shot_type: 'approach', club_type: 'non_driver',
      lie_before: 'fairway', distance_to_hole_before: 80, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 15, distance_unit_after: 'feet',
      shot_distance: 80,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 5, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 15, distance_unit_before: 'feet',
      result: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 15, putt_made: false,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 6, shot_type: 'putting', club_type: 'putter',
      lie_before: 'green', distance_to_hole_before: 2, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet',
      shot_distance: 0, putt_distance_feet: 2, putt_made: true,
    }),
  ];
}

// ============================================================================
// PRESET SCENARIOS (ShotRecord arrays for client-side tests)
// ============================================================================

/** Par 4 birdie: tee→fairway, approach→green, 1 putt */
export function par4BirdieShotRecords(): ShotRecord[] {
  return [
    makeShotRecord({
      shotNumber: 1, shotType: 'tee', clubType: 'driver',
      lieBefore: 'tee', distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
      result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250,
    }),
    makeShotRecord({
      shotNumber: 2, shotType: 'approach', clubType: 'non_driver',
      lieBefore: 'fairway', distanceToHoleBefore: 150, distanceUnitBefore: 'yards',
      result: 'green', distanceToHoleAfter: 10, distanceUnitAfter: 'feet', shotDistance: 150,
    }),
    makeShotRecord({
      shotNumber: 3, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 10, distanceUnitBefore: 'feet',
      result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
      puttBreak: 'left_to_right', puttSlope: 'uphill',
    }),
  ];
}

/** Par 4 bogey with missed fairway and missed GIR */
export function par4BogeyShotRecords(): ShotRecord[] {
  return [
    makeShotRecord({
      shotNumber: 1, shotType: 'tee', clubType: 'driver',
      lieBefore: 'tee', distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
      result: 'rough', distanceToHoleAfter: 160, distanceUnitAfter: 'yards', shotDistance: 240,
      missDirection: 'right',
    }),
    makeShotRecord({
      shotNumber: 2, shotType: 'approach', clubType: 'non_driver',
      lieBefore: 'rough', distanceToHoleBefore: 160, distanceUnitBefore: 'yards',
      result: 'rough', distanceToHoleAfter: 30, distanceUnitAfter: 'yards', shotDistance: 130,
      missDirection: 'short',
    }),
    makeShotRecord({
      shotNumber: 3, shotType: 'around_green', clubType: 'non_driver',
      lieBefore: 'rough', distanceToHoleBefore: 30, distanceUnitBefore: 'yards',
      result: 'green', distanceToHoleAfter: 15, distanceUnitAfter: 'feet', shotDistance: 30,
    }),
    makeShotRecord({
      shotNumber: 4, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 15, distanceUnitBefore: 'feet',
      result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 0,
    }),
    makeShotRecord({
      shotNumber: 5, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 2, distanceUnitBefore: 'feet',
      result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
    }),
  ];
}

/** Par 3 with GIR: approach→green, 2 putts → par */
export function par3GirShotRecords(): ShotRecord[] {
  return [
    makeShotRecord({
      shotNumber: 1, shotType: 'tee', clubType: 'non_driver',
      lieBefore: 'tee', distanceToHoleBefore: 180, distanceUnitBefore: 'yards',
      result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet', shotDistance: 180,
    }),
    makeShotRecord({
      shotNumber: 2, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 20, distanceUnitBefore: 'feet',
      result: 'green', distanceToHoleAfter: 3, distanceUnitAfter: 'feet', shotDistance: 0,
      puttBreak: 'straight', puttSlope: 'level',
    }),
    makeShotRecord({
      shotNumber: 3, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 3, distanceUnitBefore: 'feet',
      result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
    }),
  ];
}

/** Sand save par: tee→fairway, approach→sand, bunker→green, 1 putt */
export function sandSaveShotRecords(): ShotRecord[] {
  return [
    makeShotRecord({
      shotNumber: 1, shotType: 'tee', clubType: 'driver',
      lieBefore: 'tee', distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
      result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250,
    }),
    makeShotRecord({
      shotNumber: 2, shotType: 'approach', clubType: 'non_driver',
      lieBefore: 'fairway', distanceToHoleBefore: 150, distanceUnitBefore: 'yards',
      result: 'sand', distanceToHoleAfter: 20, distanceUnitAfter: 'yards', shotDistance: 130,
    }),
    makeShotRecord({
      shotNumber: 3, shotType: 'around_green', clubType: 'non_driver',
      lieBefore: 'sand', distanceToHoleBefore: 20, distanceUnitBefore: 'yards',
      result: 'green', distanceToHoleAfter: 5, distanceUnitAfter: 'feet', shotDistance: 20,
    }),
    makeShotRecord({
      shotNumber: 4, shotType: 'putting', clubType: 'putter',
      lieBefore: 'green', distanceToHoleBefore: 5, distanceUnitBefore: 'feet',
      result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
    }),
  ];
}

/** Hole-out from fairway on par 4: tee→fairway, approach→hole (eagle) */
export function holeOutShotRecords(): ShotRecord[] {
  return [
    makeShotRecord({
      shotNumber: 1, shotType: 'tee', clubType: 'driver',
      lieBefore: 'tee', distanceToHoleBefore: 350, distanceUnitBefore: 'yards',
      result: 'fairway', distanceToHoleAfter: 120, distanceUnitAfter: 'yards', shotDistance: 230,
    }),
    makeShotRecord({
      shotNumber: 2, shotType: 'approach', clubType: 'non_driver',
      lieBefore: 'fairway', distanceToHoleBefore: 120, distanceUnitBefore: 'yards',
      result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'yards', shotDistance: 120,
    }),
  ];
}
