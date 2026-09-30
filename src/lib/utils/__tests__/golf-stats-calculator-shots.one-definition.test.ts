import { describe, it, expect } from 'vitest';
import {
  calculateHoleStatsFromShots,
  calculateStatsFromShots,
  getPuttDistanceBucket,
  MAX_PUTT_FEET,
  normalizePuttFeet,
} from '../golf-stats-calculator-shots';
import type { HoleInfo, RawShot } from '../golf-stats-calculator-shots';
import { aggregatePuttBuckets } from '@/lib/golf/leak-map-buckets';
import { makeHoleInfo, makeRawShot, makeRoundInfo } from '@/test/fixtures/golf-shots';

/**
 * Owner decision Q-93: putt make %, sand save and penalties each have ONE
 * definition, shared by the current app and Clubhouse. These tests pin the
 * calculator side and its agreement with the leak-map path.
 */

const round = makeRoundInfo({ id: 'round-1', holes_played: 18 });

// ----------------------------------------------------------------------------
// Putt make % — calculator and leak map, same shots, same numbers
// ----------------------------------------------------------------------------

/** Fine calculator band -> the six reporting bands the leak map shows. */
const REPORT_BAND_OF: Record<string, string> = {
  '0_3': '0_3',
  '3_5': '3_5',
  '5_10': '5_10',
  '10_15': '10_15',
  '15_20': '15_25',
  '20_25': '15_25',
  '25_30': '25_plus',
  '30_35': '25_plus',
  '35_plus': '25_plus',
};

type PuttSpec = { feet: number; how: 'hole_null' | 'made_true' | 'miss_false' | 'miss_null' };

function putt(holeNumber: number, shotNumber: number, spec: PuttSpec): RawShot {
  const holed = spec.how === 'hole_null' || spec.how === 'made_true';
  return makeRawShot({
    hole_number: holeNumber,
    shot_number: shotNumber,
    shot_type: 'putting',
    club_type: 'putter',
    lie_before: 'green',
    distance_to_hole_before: spec.feet,
    distance_unit_before: 'feet',
    // A result of 'hole' with a NULL putt_made is a make; the leak path used to
    // drop those rows.
    result: spec.how === 'hole_null' ? 'hole' : 'green',
    distance_to_hole_after: holed ? 0 : 2,
    distance_unit_after: 'feet',
    putt_made: spec.how === 'hole_null' || spec.how === 'miss_null' ? null : spec.how === 'made_true',
    // Deliberately wrong: the make % must start from distance_to_hole_before.
    putt_distance_feet: 99,
  });
}

/** 10 putts per band (7 made in 0-3, 5 in 3-5, 3 in 5-10, 2 in 10-15, ...). */
const BAND_SPECS: Record<number, PuttSpec[]> = {
  // hole 1: 0-3 ft, edge at exactly 3
  1: [
    { feet: 0, how: 'hole_null' },
    { feet: 1, how: 'hole_null' },
    { feet: 2, how: 'hole_null' },
    { feet: 3, how: 'hole_null' },
    { feet: 3, how: 'made_true' },
    { feet: 2.5, how: 'made_true' },
    { feet: 3, how: 'made_true' },
    { feet: 3, how: 'miss_false' },
    { feet: 1, how: 'miss_false' },
    { feet: 2, how: 'miss_null' },
  ],
  // hole 2: 3-5 ft, edges at 5 (and just over 3)
  2: [
    { feet: 3.1, how: 'hole_null' },
    { feet: 4, how: 'hole_null' },
    { feet: 5, how: 'hole_null' },
    { feet: 5, how: 'made_true' },
    { feet: 4, how: 'made_true' },
    { feet: 5, how: 'miss_false' },
    { feet: 5, how: 'miss_false' },
    { feet: 4.5, how: 'miss_null' },
    { feet: 4, how: 'miss_false' },
    { feet: 3.5, how: 'miss_null' },
  ],
  // hole 3: 5-10 ft, edge at 10
  3: [
    { feet: 5.5, how: 'hole_null' },
    { feet: 10, how: 'hole_null' },
    { feet: 10, how: 'made_true' },
    { feet: 6, how: 'miss_false' },
    { feet: 7, how: 'miss_false' },
    { feet: 8, how: 'miss_null' },
    { feet: 9, how: 'miss_false' },
    { feet: 10, how: 'miss_false' },
    { feet: 10, how: 'miss_null' },
    { feet: 7.5, how: 'miss_false' },
  ],
  // hole 4: 10-15 ft, edge at 15
  4: [
    { feet: 10.5, how: 'hole_null' },
    { feet: 15, how: 'made_true' },
    { feet: 11, how: 'miss_false' },
    { feet: 12, how: 'miss_false' },
    { feet: 13, how: 'miss_null' },
    { feet: 14, how: 'miss_false' },
    { feet: 15, how: 'miss_false' },
    { feet: 15, how: 'miss_null' },
    { feet: 12.5, how: 'miss_false' },
    { feet: 11.5, how: 'miss_false' },
  ],
  // hole 5: 15-25 ft (15-20 and 20-25 fine bands), edges at 20 and 25
  5: [
    { feet: 15.5, how: 'hole_null' },
    { feet: 20, how: 'made_true' },
    { feet: 17, how: 'miss_false' },
    { feet: 18, how: 'miss_null' },
    { feet: 20, how: 'miss_false' },
    { feet: 21, how: 'hole_null' },
    { feet: 22, how: 'miss_false' },
    { feet: 24, how: 'miss_false' },
    { feet: 25, how: 'miss_null' },
    { feet: 25, how: 'miss_false' },
  ],
  // hole 6: 25+ ft, one mis-keyed 390 ft putt clamps to the 120 ft ceiling
  6: [
    { feet: 25.5, how: 'hole_null' },
    { feet: 30, how: 'miss_false' },
    { feet: 35, how: 'miss_false' },
    { feet: 36, how: 'miss_null' },
    { feet: 40, how: 'miss_false' },
    { feet: 60, how: 'miss_false' },
    { feet: 90, how: 'miss_null' },
    { feet: 120, how: 'miss_false' },
    { feet: 390, how: 'miss_false' },
    { feet: 28, how: 'made_true' },
  ],
};

function allPuttShots(): RawShot[] {
  return Object.entries(BAND_SPECS).flatMap(([hole, specs]) =>
    specs.map((spec, i) => putt(Number(hole), i + 1, spec)),
  );
}

function holeInfos(): HoleInfo[] {
  return Object.keys(BAND_SPECS).map((h) =>
    makeHoleInfo({ hole_number: Number(h), par: 4, score: 14, putts: 10, gir: true, fairway_hit: true }),
  );
}

describe('putt make % — one definition across the calculator and the leak map', () => {
  it('reports the same made/total in every band from the same shots', () => {
    const shots = allPuttShots();
    const holes = holeInfos();

    // Calculator side: the hole-level tallies the aggregate is built from,
    // merged to the six reporting bands.
    const merged: Record<string, { made: number; total: number }> = {};
    for (const h of holes) {
      const hole = calculateHoleStatsFromShots(
        shots.filter((s) => s.hole_number === h.hole_number),
        h,
      );
      for (const [band, mc] of Object.entries(hole.puttMakeByBand)) {
        const key = REPORT_BAND_OF[band]!;
        merged[key] ??= { made: 0, total: 0 };
        merged[key].made += mc.made;
        merged[key].total += mc.total;
      }
    }

    const leak = aggregatePuttBuckets(shots, new Map());
    for (const bucket of leak) {
      const calc = merged[bucket.bucket_id];
      expect(calc, `calculator has band ${bucket.bucket_id}`).toBeDefined();
      expect(bucket.sample_n, `${bucket.bucket_id} sample_n`).toBe(calc!.total);
      expect(bucket.team_value, `${bucket.bucket_id} make %`).toBe(
        Math.round((calc!.made / calc!.total) * 1000) / 10,
      );
    }

    // Spot-check the absolute numbers so a matching pair of wrong numbers can't pass.
    const byId = Object.fromEntries(leak.map((b) => [b.bucket_id, b]));
    expect(byId['0_3']).toMatchObject({ sample_n: 10, team_value: 70 });
    expect(byId['3_5']).toMatchObject({ sample_n: 10, team_value: 50 });
    expect(byId['5_10']).toMatchObject({ sample_n: 10, team_value: 30 });
    expect(byId['10_15']).toMatchObject({ sample_n: 10, team_value: 20 });
    expect(byId['15_25']).toMatchObject({ sample_n: 10, team_value: 30 });
    expect(byId['25_plus']).toMatchObject({ sample_n: 10, team_value: 20 });
  });

  it('the public GolfStats make % fields carry those same numbers for the bands they expose', () => {
    const stats = calculateStatsFromShots(allPuttShots(), holeInfos(), [round]);
    const leak = Object.fromEntries(aggregatePuttBuckets(allPuttShots(), new Map()).map((b) => [b.bucket_id, b]));

    expect(stats.puttMakeCount0_3).toBe(leak['0_3']!.sample_n);
    expect(stats.puttMakePct0_3).toBe(leak['0_3']!.team_value);
    expect(stats.puttMakeCount3_5).toBe(leak['3_5']!.sample_n);
    expect(stats.puttMakePct3_5).toBe(leak['3_5']!.team_value);
    expect(stats.puttMakeCount5_10).toBe(leak['5_10']!.sample_n);
    expect(stats.puttMakePct5_10).toBe(leak['5_10']!.team_value);
    expect(stats.puttMakeCount10_15).toBe(leak['10_15']!.sample_n);
    expect(stats.puttMakePct10_15).toBe(leak['10_15']!.team_value);
  });

  it('keeps MAX_PUTT_FEET, normalizePuttFeet and getPuttDistanceBucket importable from the calculator', () => {
    expect(MAX_PUTT_FEET).toBe(120);
    expect(normalizePuttFeet(390)).toBe(120);
    expect(getPuttDistanceBucket(3)).toBe('0_3');
    expect(getPuttDistanceBucket(5)).toBe('3_5');
    expect(getPuttDistanceBucket(25.01)).toBe('25_30');
  });
});

// ----------------------------------------------------------------------------
// Sand save — ONE figure: the golf_holes.sand_save flag
// ----------------------------------------------------------------------------

function sandHoleShots(holeNumber: number, chipLie: 'sand' | 'rough'): RawShot[] {
  return [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
      distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 2, shot_type: 'approach', lie_before: 'fairway',
      distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: chipLie === 'sand' ? 'sand' : 'rough', distance_to_hole_after: 15, distance_unit_after: 'yards',
      shot_distance: 135,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3, shot_type: 'around_green', lie_before: chipLie,
      distance_to_hole_before: 15, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 4, distance_unit_after: 'feet', shot_distance: 15,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 4, shot_type: 'putting', lie_before: 'green',
      distance_to_hole_before: 4, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
    }),
  ];
}

describe('sand save — scramblingPctSand and sandSavePercentage are one figure', () => {
  it('carries the golf_holes.sand_save flag into both field families', () => {
    // H1: flag true, chip logged from the rough  -> a save (chip-from-sand rule would miss it)
    // H2: flag false, chip from sand, bogey      -> an attempt, not a save
    // H3: flag null, chip from sand, bogey       -> NOT a bunker visit on the flag (chip-from-sand rule counted it)
    // H4: flag true, chip from sand, par         -> a save
    const shots = [
      ...sandHoleShots(1, 'rough'),
      ...sandHoleShots(2, 'sand'),
      ...sandHoleShots(3, 'sand'),
      ...sandHoleShots(4, 'sand'),
    ];
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4, score: 4, putts: 1, gir: false, sand_save: true }),
      makeHoleInfo({ hole_number: 2, par: 4, score: 5, putts: 1, gir: false, sand_save: false }),
      makeHoleInfo({ hole_number: 3, par: 4, score: 5, putts: 1, gir: false, sand_save: null }),
      makeHoleInfo({ hole_number: 4, par: 4, score: 4, putts: 1, gir: false, sand_save: true }),
    ];

    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.sandSaveAttempts).toBe(3);
    expect(stats.sandSavesMade).toBe(2);
    expect(stats.sandSavePercentage).toBe(66.7);
    // The scrambling "from sand" readout is the SAME figure.
    expect(stats.scrambleSandAttempts).toBe(stats.sandSaveAttempts);
    expect(stats.scrambleSandMade).toBe(stats.sandSavesMade);
    expect(stats.scramblingPctSand).toBe(stats.sandSavePercentage);
  });

  it('keeps the lie split of scrambling for fairway / rough / fringe unchanged', () => {
    const shots = [...sandHoleShots(1, 'rough'), ...sandHoleShots(2, 'sand')];
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4, score: 4, putts: 1, gir: false, sand_save: true }),
      makeHoleInfo({ hole_number: 2, par: 4, score: 5, putts: 1, gir: false, sand_save: false }),
    ];
    const stats = calculateStatsFromShots(shots, holes, [round]);

    expect(stats.scrambleRoughAttempts).toBe(1);
    expect(stats.scrambleRoughMade).toBe(1);
    expect(stats.scramblingPctRough).toBe(100);
    expect(stats.scrambleFairwayAttempts).toBe(0);
    expect(stats.scrambleFringeAttempts).toBe(0);
  });

  it('a scorecard-only hole (no shots) still carries its sand_save flag', () => {
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4, score: 4, putts: 1, gir: false, sand_save: true }),
      makeHoleInfo({ hole_number: 2, par: 4, score: 5, putts: 2, gir: false, sand_save: false }),
      makeHoleInfo({ hole_number: 3, par: 4, score: 4, putts: 2, gir: true, sand_save: null }),
    ];
    const stats = calculateStatsFromShots([], holes, [round]);

    expect(stats.sandSaveAttempts).toBe(2);
    expect(stats.sandSavesMade).toBe(1);
    expect(stats.scrambleSandAttempts).toBe(2);
    expect(stats.scrambleSandMade).toBe(1);
    expect(stats.scramblingPctSand).toBe(50);
  });
});

// ----------------------------------------------------------------------------
// Penalties — ONE count: golf_holes.penalty_strokes
// ----------------------------------------------------------------------------

function holeWithPenaltyShots(holeNumber: number, penaltyShots: number): RawShot[] {
  const shots: RawShot[] = [
    makeRawShot({
      hole_number: holeNumber, shot_number: 1, shot_type: 'tee', lie_before: 'tee',
      distance_to_hole_before: 400, distance_unit_before: 'yards',
      result: 'fairway', distance_to_hole_after: 150, distance_unit_after: 'yards', shot_distance: 250,
    }),
  ];
  for (let i = 0; i < penaltyShots; i++) {
    shots.push(
      makeRawShot({
        hole_number: holeNumber, shot_number: 2 + i, shot_type: 'penalty', lie_before: 'fairway',
        distance_to_hole_before: 150, distance_unit_before: 'yards', result: 'penalty',
        distance_to_hole_after: 150, distance_unit_after: 'yards', is_penalty: true,
      }),
    );
  }
  shots.push(
    makeRawShot({
      hole_number: holeNumber, shot_number: 2 + penaltyShots, shot_type: 'approach', lie_before: 'fairway',
      distance_to_hole_before: 150, distance_unit_before: 'yards',
      result: 'green', distance_to_hole_after: 10, distance_unit_after: 'feet', shot_distance: 150,
    }),
    makeRawShot({
      hole_number: holeNumber, shot_number: 3 + penaltyShots, shot_type: 'putting', lie_before: 'green',
      distance_to_hole_before: 10, distance_unit_before: 'feet',
      result: 'hole', distance_to_hole_after: 0, distance_unit_after: 'feet', putt_made: true,
    }),
  );
  return shots;
}

describe('penalties — golf_holes.penalty_strokes is the count', () => {
  it('uses penalty_strokes over the is_penalty shot rows when the hole row provides it', () => {
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, score: 6, putts: 1, penalty_strokes: 2 })];
    const stats = calculateStatsFromShots(holeWithPenaltyShots(1, 1), holes, [round]);

    expect(stats.totalPenalties).toBe(2);
  });

  it('treats a null penalty_strokes as 0, like the DB cache (COALESCE(penalty_strokes, 0))', () => {
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, score: 5, putts: 1, penalty_strokes: null })];
    const stats = calculateStatsFromShots(holeWithPenaltyShots(1, 1), holes, [round]);

    expect(stats.totalPenalties).toBe(0);
  });

  it('falls back to the is_penalty shot count only when the field is absent', () => {
    const holes = [makeHoleInfo({ hole_number: 1, par: 4, score: 6, putts: 1 })];
    const stats = calculateStatsFromShots(holeWithPenaltyShots(1, 2), holes, [round]);

    expect(stats.totalPenalties).toBe(2);
  });

  it('a scorecard-only hole (no shots) carries its penalty_strokes', () => {
    const holes = [
      makeHoleInfo({ hole_number: 1, par: 4, score: 5, putts: 2, penalty_strokes: 1 }),
      makeHoleInfo({ hole_number: 2, par: 4, score: 4, putts: 2, penalty_strokes: 0 }),
    ];
    const stats = calculateStatsFromShots([], holes, [round]);

    expect(stats.totalPenalties).toBe(1);
  });

  it('normalises per 18 holes, like penalty_strokes_per_round in the DB cache', () => {
    // 9 holes played, 1 penalty stroke -> 1 / 9 * 18 = 2.0 per 18.
    const holes = Array.from({ length: 9 }, (_, i) =>
      makeHoleInfo({ hole_number: i + 1, par: 4, score: 4, putts: 2, penalty_strokes: i === 0 ? 1 : 0 }),
    );
    const stats = calculateStatsFromShots([], holes, [makeRoundInfo({ id: 'round-1', holes_played: 9 })]);

    expect(stats.totalPenalties).toBe(1);
    expect(stats.holesPlayed).toBe(9);
    expect(stats.penaltiesPerRound).toBe(2);
  });
});
