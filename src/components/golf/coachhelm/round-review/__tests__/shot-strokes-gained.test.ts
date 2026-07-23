import { describe, it, expect } from 'vitest';
import {
  computeShotStrokesGained,
  attachShotStrokesGained,
  sumHoleStrokesGained,
  sumHoleStrokesGainedByCategory,
  type CategorizableShot,
} from '../shot-strokes-gained';
import { calculateStrokesGainedForShot, type RawShot } from '@/lib/utils/golf-stats-calculator-shots';

function rawShot(overrides: Partial<RawShot> = {}): RawShot {
  return {
    id: 's1',
    round_id: 'r1',
    hole_number: 6,
    shot_number: 1,
    shot_type: 'tee',
    club_type: 'driver',
    lie_before: 'tee',
    lie_after: 'fairway',
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
    putt_made: null,
    is_penalty: false,
    penalty_type: null,
    ...overrides,
  };
}

describe('computeShotStrokesGained', () => {
  it('delegates to the canonical calculateStrokesGainedForShot (never the dead strokes-gained.ts)', () => {
    const shot = rawShot();
    expect(computeShotStrokesGained(shot, 1)).toBe(calculateStrokesGainedForShot(shot, 1));
  });

  it('is null-honest: returns null (never a fabricated 0) when lie_before is missing', () => {
    const shot = rawShot({ lie_before: null });
    expect(computeShotStrokesGained(shot)).toBeNull();
  });

  it('is null-honest: returns null when distance_to_hole_before is missing', () => {
    const shot = rawShot({ distance_to_hole_before: null });
    expect(computeShotStrokesGained(shot)).toBeNull();
  });

  it('applies the scale multiplier (women\'s/NCAA team baseline) and differs from the unscaled value', () => {
    const shot = rawShot();
    const unscaled = computeShotStrokesGained(shot, 1);
    const scaled = computeShotStrokesGained(shot, 1.083);
    expect(unscaled).not.toBeNull();
    expect(scaled).not.toBeNull();
    expect(scaled).not.toBe(unscaled);
  });

  it('matches the real prod hole-6 penalty shot (b126b8f6…, shot 1: tee, 564y, OB) — a real number, not null', () => {
    // Pulled live from prod via the Supabase MCP during STEP 1 verification.
    const penaltyShot = rawShot({
      shot_type: 'penalty',
      club_type: 'non_driver',
      lie_before: 'tee',
      lie_after: 'penalty',
      distance_to_hole_before: 564,
      distance_unit_before: 'yards',
      result: 'penalty',
      distance_to_hole_after: 564,
      distance_unit_after: 'yards',
      shot_distance: 0,
      is_penalty: true,
      penalty_type: 'ob',
    });
    const sg = computeShotStrokesGained(penaltyShot, 1);
    expect(sg).not.toBeNull();
    expect(Number.isFinite(sg)).toBe(true);
    // A stroke spent going nowhere (before === after) must never read as a
    // GAIN — the sign is the honesty-critical assertion here, not the exact
    // magnitude (which tracks the shared benchmark table and can shift).
    expect(sg as number).toBeLessThan(0);
  });

  it('matches the real prod hole-6 holed putt (shot 7: green, 3ft -> holed)', () => {
    const holedPutt = rawShot({
      shot_type: 'putting',
      club_type: 'putter',
      lie_before: 'green',
      lie_after: 'green',
      distance_to_hole_before: 3,
      distance_unit_before: 'feet',
      result: 'hole',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      shot_distance: 1,
      putt_break: 'straight',
      putt_slope: 'level',
      putt_distance_feet: 3,
      putt_made: true,
    });
    const sg = computeShotStrokesGained(holedPutt, 1);
    expect(sg).toBe(calculateStrokesGainedForShot(holedPutt, 1));
    expect(sg).not.toBeNull();
    // Made a putt that was expected to take >1 stroke on average -> a gain.
    expect(sg as number).toBeGreaterThan(0);
  });
});

describe('attachShotStrokesGained', () => {
  it('attaches sg to every shot without mutating the input array', () => {
    const shots = [rawShot({ shot_number: 1 }), rawShot({ shot_number: 2, lie_before: null })];
    const original = shots.map((s) => ({ ...s }));
    const result = attachShotStrokesGained(shots);

    expect(result).toHaveLength(2);
    expect(result[0]!.sg).toBe(calculateStrokesGainedForShot(shots[0]!));
    expect(result[1]!.sg).toBeNull(); // lie_before missing -> null-honest
    // Original input untouched.
    expect(shots).toEqual(original);
    expect((shots[0] as RawShot & { sg?: number }).sg).toBeUndefined();
  });

  it('returns a new array reference (pure)', () => {
    const shots = [rawShot()];
    const result = attachShotStrokesGained(shots);
    expect(result).not.toBe(shots);
  });
});

describe('sumHoleStrokesGained', () => {
  it('returns null total for an empty hole (no shots)', () => {
    expect(sumHoleStrokesGained([])).toEqual({ total: null, computedShots: 0, totalShots: 0 });
  });

  it('returns null total when every shot has a null sg (never fabricates 0)', () => {
    const result = sumHoleStrokesGained([{ sg: null }, { sg: null }, { sg: undefined }]);
    expect(result.total).toBeNull();
    expect(result.computedShots).toBe(0);
    expect(result.totalShots).toBe(3);
  });

  it('sums only the shots that DID compute, ignoring null/undefined ones', () => {
    const result = sumHoleStrokesGained([
      { sg: 0.5 },
      { sg: null },
      { sg: -1.2 },
      { sg: undefined },
      { sg: 0.3 },
    ]);
    expect(result.total).toBeCloseTo(-0.4, 10);
    expect(result.computedShots).toBe(3);
    expect(result.totalShots).toBe(5);
  });

  it('matches a full 7-shot hole-6-shaped hole (1 null-eligible penalty + 6 scoreable shots)', () => {
    // Mirrors the real prod hole-6 shape (tee penalty, 2 approaches, a
    // fairway-to-green approach, then 3 putts) — every shot here HAS
    // lie_before + distance_to_hole_before, so every one is computable.
    const shots = [
      { sg: -1.9 }, // penalty
      { sg: 0.4 }, // approach out of the rough
      { sg: -0.2 }, // approach to fairway
      { sg: 0.6 }, // approach to green
      { sg: -0.3 }, // first putt (missed)
      { sg: -0.1 }, // second putt (missed)
      { sg: 0.9 }, // third putt (holed)
    ];
    const result = sumHoleStrokesGained(shots);
    expect(result.computedShots).toBe(7);
    expect(result.totalShots).toBe(7);
    expect(result.total).toBeCloseTo(-0.6, 10);
  });
});

describe('sumHoleStrokesGainedByCategory', () => {
  it('returns every field null for an empty hole (no shots)', () => {
    const result = sumHoleStrokesGainedByCategory([], 4);
    expect(result).toEqual({
      total: null,
      computedShots: 0,
      totalShots: 0,
      tee: null,
      approach: null,
      around_green: null,
      putting: null,
    });
  });

  it('is null-honest per category: a category with zero contributing shots stays null, never a fabricated 0', () => {
    const shots: CategorizableShot[] = [
      { shot_type: 'putting', lie_before: 'green', sg: 0.42 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, 4);
    expect(result.putting).toBeCloseTo(0.42, 10);
    expect(result.tee).toBeNull();
    expect(result.approach).toBeNull();
    expect(result.around_green).toBeNull();
    expect(result.total).toBeCloseTo(0.42, 10);
  });

  it('skips shots with a null/undefined sg entirely — never divides them into a category', () => {
    const shots: CategorizableShot[] = [
      { shot_type: 'tee', lie_before: 'tee', sg: null },
      { shot_type: 'approach', lie_before: 'fairway', sg: undefined },
      { shot_type: 'putting', lie_before: 'green', sg: -0.2 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, 4);
    expect(result.computedShots).toBe(1);
    expect(result.totalShots).toBe(3);
    expect(result.tee).toBeNull();
    expect(result.approach).toBeNull();
    expect(result.putting).toBeCloseTo(-0.2, 10);
  });

  it('buckets a penalty stroke into the OFFENDING category (tee, on a non-par-3) via getPenaltyCategory — never getStrokesGainedCategory', () => {
    const shots: CategorizableShot[] = [
      { shot_type: 'penalty', lie_before: 'tee', distance_to_hole_before: 400, is_penalty: true, sg: -1.9 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, 4);
    expect(result.tee).toBeCloseTo(-1.9, 10);
    expect(result.approach).toBeNull();
  });

  it('buckets a tee-shot penalty into approach on a PAR-3 (matches getStrokesGainedCategory\'s own par-3 tee-as-approach rule)', () => {
    const shots: CategorizableShot[] = [
      { shot_type: 'penalty', lie_before: 'tee', distance_to_hole_before: 175, is_penalty: true, sg: -1.6 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, 3);
    expect(result.tee).toBeNull();
    expect(result.approach).toBeCloseTo(-1.6, 10);
  });

  it('treats an unknown par (null) as "never the par-3 special case" — a safe default, not a fabricated par', () => {
    const shots: CategorizableShot[] = [
      { shot_type: 'tee', lie_before: 'tee', sg: 0.2 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, null);
    expect(result.tee).toBeCloseTo(0.2, 10);
  });

  it('reproduces the real prod hole-6 shape (par 5): categories sum to the SAME total sumHoleStrokesGained already verifies (-0.6)', () => {
    // Verbatim per-shot sg values from the `sumHoleStrokesGained` hole-6 test
    // above, now with the shot_type/lie_before needed to categorize them —
    // tee penalty, 2 approaches out of trouble, 1 approach to the green,
    // then 3 putts (2 missed, 1 holed).
    const shots: CategorizableShot[] = [
      { shot_type: 'penalty', lie_before: 'tee', distance_to_hole_before: 564, is_penalty: true, sg: -1.9 },
      { shot_type: 'approach', lie_before: 'tee', sg: 0.4 },
      { shot_type: 'approach', lie_before: 'rough', sg: -0.2 },
      { shot_type: 'approach', lie_before: 'fairway', sg: 0.6 },
      { shot_type: 'putting', lie_before: 'green', sg: -0.3 },
      { shot_type: 'putting', lie_before: 'green', sg: -0.1 },
      { shot_type: 'putting', lie_before: 'green', sg: 0.9 },
    ];
    const result = sumHoleStrokesGainedByCategory(shots, 5);
    expect(result.tee).toBeCloseTo(-1.9, 10); // only the penalty
    expect(result.approach).toBeCloseTo(0.8, 10); // 0.4 - 0.2 + 0.6
    expect(result.around_green).toBeNull();
    expect(result.putting).toBeCloseTo(0.5, 10); // -0.3 - 0.1 + 0.9
    expect(result.total).toBeCloseTo(-0.6, 10);
    expect(result.computedShots).toBe(7);
    expect(result.totalShots).toBe(7);
  });
});
