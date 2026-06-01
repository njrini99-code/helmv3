/**
 * Unit tests for the PLAY C shot-level driver aggregator (`buildShotDrivers`).
 *
 * Pins: correct dominant tendencies, the min-sample guard omits thin bands,
 * dominant-share guard omits balanced groups, deterministic output, never
 * throws on partial/empty input, honest percentages.
 *
 * Run: npm test -- shot-drivers
 */
import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { buildShotDrivers } from './shot-drivers';
import type { ShotDriverInput } from './shot-drivers';

/* ───────────────────────────────────────────────────────────────────────────
 * Fixture builders
 * ────────────────────────────────────────────────────────────────────────── */

function approachMiss(
  distance: number,
  missDir: string | null,
  lie: string | null,
): ShotDriverInput {
  return {
    shot_type: 'approach',
    distance_to_hole_before: distance,
    distance_unit_before: 'yards',
    approach_miss_details: { miss_direction: missDir, lie_type: lie, distance_from_green_yards: 20 },
  };
}

function puttMiss(breakDir: string | null, tags: string[] | null): ShotDriverInput {
  return {
    shot_type: 'putting',
    putt_details: { break_direction: breakDir, miss_tags: tags },
  };
}

function teeDrive(result: string, missDir: string | null): ShotDriverInput {
  return {
    shot_type: 'tee',
    club_type: 'driver',
    result,
    miss_direction: missDir,
  };
}

function repeat<T>(n: number, make: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => make(i));
}

/* ───────────────────────────────────────────────────────────────────────────
 * APPROACH
 * ────────────────────────────────────────────────────────────────────────── */

describe('buildShotDrivers — approach', () => {
  test('dominant miss direction + lie in a 150-175 band emits a shot_detail driver', () => {
    // 10 misses in 150-175: 7 short_right into rough, 3 mixed.
    const shots: ShotDriverInput[] = [
      ...repeat(7, () => approachMiss(160, 'short_right', 'rough')),
      ...repeat(3, () => approachMiss(160, 'long', 'fairway')),
    ];
    const out = buildShotDrivers(shots);
    expect(out.approach).toHaveLength(1);
    const d = out.approach![0]!;
    expect(d.source).toBe('shot_detail');
    expect(d.source_insight_ids).toEqual([]);
    expect(d.drills).toEqual([]);
    expect(d.title).toContain('150-175');
    // 7/10 = 70% short-right, 7/10 = 70% rough — both clear the 50% threshold.
    expect(d.prose).toContain('short-right 70%');
    expect(d.prose).toContain('the rough 70%');
    expect(d.prose).toContain('10 shots');
  });

  test('min-sample guard: a band with <8 misses emits no approach driver', () => {
    const shots = repeat(7, () => approachMiss(160, 'short_right', 'rough'));
    expect(buildShotDrivers(shots).approach).toBeUndefined();
  });

  test('balanced band (no dominant signal) emits no approach driver', () => {
    // 10 misses, evenly spread across 4 directions and 4 lies → nothing dominates.
    const dirs = ['short', 'long', 'left', 'right'];
    const lies = ['fairway', 'rough', 'bunker', 'hazard'];
    const shots = repeat(12, (i) => approachMiss(160, dirs[i % 4]!, lies[i % 4]!));
    expect(buildShotDrivers(shots).approach).toBeUndefined();
  });

  test('picks the band with the MOST qualifying misses', () => {
    const shots: ShotDriverInput[] = [
      ...repeat(8, () => approachMiss(140, 'short', 'fairway')), // <150 band: 8
      ...repeat(12, () => approachMiss(210, 'left', 'rough')), // 200+ band: 12 (wins)
    ];
    const d = buildShotDrivers(shots).approach![0]!;
    expect(d.title).toContain('200+');
  });

  test('approaches over 250yd are excluded (not real approaches)', () => {
    const shots = repeat(10, () => approachMiss(300, 'short_right', 'rough'));
    expect(buildShotDrivers(shots).approach).toBeUndefined();
  });

  test('feet unit is normalized to yards for banding', () => {
    // 480 feet = 160 yards → 150-175 band.
    const shots = repeat(8, () => ({
      shot_type: 'approach',
      distance_to_hole_before: 480,
      distance_unit_before: 'feet',
      approach_miss_details: { miss_direction: 'short', lie_type: 'rough', distance_from_green_yards: 20 },
    } satisfies ShotDriverInput));
    const d = buildShotDrivers(shots).approach![0]!;
    expect(d.title).toContain('150-175');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * PUTTING
 * ────────────────────────────────────────────────────────────────────────── */

describe('buildShotDrivers — putting', () => {
  test('dominant miss tag within a break group emits a shot_detail driver', () => {
    // 10 left_to_right missed putts: 8 low, 2 short.
    const shots: ShotDriverInput[] = [
      ...repeat(8, () => puttMiss('left_to_right', ['low'])),
      ...repeat(2, () => puttMiss('left_to_right', ['short'])),
    ];
    const d = buildShotDrivers(shots).putting![0]!;
    expect(d.source).toBe('shot_detail');
    expect(d.title).toContain('left-to-right');
    expect(d.prose).toContain('80% missed low');
    expect(d.prose).toContain('10 putts');
  });

  test('made putts (no miss tags) are ignored', () => {
    const shots: ShotDriverInput[] = [
      ...repeat(8, () => puttMiss('left_to_right', ['low'])),
      ...repeat(20, () => puttMiss('left_to_right', [])), // made / untagged
    ];
    const d = buildShotDrivers(shots).putting![0]!;
    // n is the 8 tagged misses, not 28.
    expect(d.prose).toContain('8 putts');
  });

  test('min-sample guard: <8 tagged misses in any break group → no driver', () => {
    const shots = repeat(7, () => puttMiss('right_to_left', ['high']));
    expect(buildShotDrivers(shots).putting).toBeUndefined();
  });

  test("break_direction 'multiple' is ignored (no clean read)", () => {
    const shots = repeat(10, () => puttMiss('multiple', ['low']));
    expect(buildShotDrivers(shots).putting).toBeUndefined();
  });

  test('no dominant tag (balanced) → no driver', () => {
    // 12 straight misses split evenly low/high/short/long → no tag ≥50%.
    const tags = ['low', 'high', 'short', 'long'];
    const shots = repeat(12, (i) => puttMiss('straight', [tags[i % 4]!]));
    expect(buildShotDrivers(shots).putting).toBeUndefined();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * TEE
 * ────────────────────────────────────────────────────────────────────────── */

describe('buildShotDrivers — tee', () => {
  test('driver off-fairway rate + dominant miss side emits a shot_detail driver', () => {
    // 20 drives: 8 fairway, 12 missed (10 left, 2 right) → 60% off-fairway,
    // 10/12 ≈ 83% of misses leak left.
    const shots: ShotDriverInput[] = [
      ...repeat(8, () => teeDrive('fairway', null)),
      ...repeat(10, () => teeDrive('rough', 'left')),
      ...repeat(2, () => teeDrive('rough', 'right')),
    ];
    const d = buildShotDrivers(shots).tee![0]!;
    expect(d.source).toBe('shot_detail');
    expect(d.title).toContain('leak left');
    expect(d.prose).toContain('20 drives');
    expect(d.prose).toContain('60%'); // off-fairway rate
    expect(d.prose).toContain('leak left');
  });

  test('non-driver tee shots are excluded from the dispersion read', () => {
    const shots: ShotDriverInput[] = [
      ...repeat(20, () => ({ shot_type: 'tee', club_type: 'non_driver', result: 'rough', miss_direction: 'left' })),
    ];
    expect(buildShotDrivers(shots).tee).toBeUndefined();
  });

  test('min-sample guard: <8 driver tee shots → no driver', () => {
    const shots = repeat(7, () => teeDrive('rough', 'left'));
    expect(buildShotDrivers(shots).tee).toBeUndefined();
  });

  test('enough drives but few misses → no driver (need ≥8 misses to talk dispersion)', () => {
    const shots: ShotDriverInput[] = [
      ...repeat(18, () => teeDrive('fairway', null)),
      ...repeat(3, () => teeDrive('rough', 'left')),
    ];
    expect(buildShotDrivers(shots).tee).toBeUndefined();
  });

  test('off-fairway but no dominant side → reports rate only, no side claim', () => {
    // 8 fairway + 10 misses split 5 left / 5 right → no side clears 60%.
    const shots: ShotDriverInput[] = [
      ...repeat(8, () => teeDrive('fairway', null)),
      ...repeat(5, () => teeDrive('rough', 'left')),
      ...repeat(5, () => teeDrive('rough', 'right')),
    ];
    const d = buildShotDrivers(shots).tee![0]!;
    expect(d.title).toBe('Driver: off-fairway rate');
    expect(d.prose).not.toContain('leak');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Robustness + determinism + honesty
 * ────────────────────────────────────────────────────────────────────────── */

describe('buildShotDrivers — robustness', () => {
  test('empty / null / undefined input → {} (never throws)', () => {
    expect(buildShotDrivers([])).toEqual({});
    expect(buildShotDrivers(null)).toEqual({});
    expect(buildShotDrivers(undefined)).toEqual({});
  });

  test('PostgREST array-shaped joins are unwrapped', () => {
    const shots = repeat(8, () => ({
      shot_type: 'approach',
      distance_to_hole_before: 160,
      distance_unit_before: 'yards',
      // join returned as a single-element array
      approach_miss_details: [{ miss_direction: 'short', lie_type: 'rough', distance_from_green_yards: 20 }],
    } satisfies ShotDriverInput));
    expect(buildShotDrivers(shots).approach).toHaveLength(1);
  });

  test('deterministic: same input → identical output', () => {
    const shots: ShotDriverInput[] = [
      ...repeat(9, () => approachMiss(160, 'short_right', 'rough')),
      ...repeat(10, () => puttMiss('right_to_left', ['high'])),
      ...repeat(8, () => teeDrive('fairway', null)),
      ...repeat(9, () => teeDrive('rough', 'right')),
    ];
    const a = JSON.stringify(buildShotDrivers(shots));
    const b = JSON.stringify(buildShotDrivers(shots.slice()));
    expect(a).toBe(b);
  });

  test('never throws on arbitrary partial rows (property)', () => {
    const rowArb = fc.record({
      shot_type: fc.option(fc.constantFrom('tee', 'approach', 'putting', 'other'), { nil: undefined }),
      club_type: fc.option(fc.constantFrom('driver', 'non_driver', 'putter'), { nil: undefined }),
      distance_to_hole_before: fc.option(fc.double({ min: -10, max: 400, noNaN: true }), { nil: null }),
      distance_unit_before: fc.option(fc.constantFrom('yards', 'feet'), { nil: undefined }),
      result: fc.option(fc.constantFrom('fairway', 'rough', 'sand', 'other'), { nil: null }),
      miss_direction: fc.option(fc.constantFrom('left', 'right', 'short', 'long', 'short_right'), { nil: null }),
      putt_details: fc.option(
        fc.record({
          miss_tags: fc.option(fc.array(fc.constantFrom('low', 'high', 'short', 'long', 'junk')), { nil: null }),
          break_direction: fc.option(fc.constantFrom('left_to_right', 'right_to_left', 'straight', 'multiple'), { nil: null }),
        }),
        { nil: null },
      ),
      approach_miss_details: fc.option(
        fc.record({
          miss_direction: fc.option(fc.constantFrom('short', 'short_right', 'left'), { nil: null }),
          lie_type: fc.option(fc.constantFrom('fairway', 'rough', 'bunker', 'sand'), { nil: null }),
          distance_from_green_yards: fc.option(fc.double({ min: 0, max: 60, noNaN: true }), { nil: null }),
        }),
        { nil: null },
      ),
    });
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 50 }), (shots) => {
        expect(() => buildShotDrivers(shots as ShotDriverInput[])).not.toThrow();
      }),
    );
  });
});
