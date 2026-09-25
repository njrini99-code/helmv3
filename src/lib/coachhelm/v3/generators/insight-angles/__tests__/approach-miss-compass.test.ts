import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import {
  ApproachMissCompassGenerator,
  composeApproachCompass,
  computeApproachCompass,
  sidesOf,
  toCompassAggregate,
} from '../approach-miss-compass';
import type { AngleHole, AngleShot } from '../angle-data';
import { PLAYER, mkData, mkHole, mkRound, mkShot } from './fixtures';

type Dir = 'short' | 'long' | 'left' | 'right' | 'short_left' | 'hit' | 'none';

/**
 * `rounds` rounds of `holes` par-4 holes: tee → approach from 150 yd that
 * ends per `pattern` (a miss finishes 15 yd away in the rough) → recovery.
 * `putts(dir)` sets how many putts follow the chip, so recovery cost per
 * side is controlled. `gap` drops a shot number after the chip on the holes
 * it returns true for (incomplete recovery record).
 */
function build(opts: {
  rounds?: number;
  holes?: 9 | 18;
  pattern: Dir[];
  putts: (d: Dir, k: number) => number;
  gap?: (k: number) => boolean;
}) {
  const nh = opts.holes ?? 18;
  const rounds = Array.from({ length: opts.rounds ?? 8 }, (_, i) => mkRound(i, { holes: nh }));
  const holes: AngleHole[] = [];
  const shots: AngleShot[] = [];
  let k = 0;
  for (const r of rounds) {
    for (let h = 1; h <= nh; h++) {
      const d = opts.pattern[k % opts.pattern.length]!;
      k += 1;
      holes.push(mkHole(r.id, h));
      shots.push(mkShot(r.id, h, 1, { shot_type: 'tee', lie_before: 'tee', lie_after: 'fairway', result: 'fairway', distance_to_hole_before: 400, distance_to_hole_after: 150, distance_unit_after: 'yards' }));
      if (d === 'hit') {
        shots.push(mkShot(r.id, h, 2, { distance_to_hole_after: 20 }));
        shots.push(mkShot(r.id, h, 3, { shot_type: 'putting', lie_before: 'green', lie_after: 'green', result: 'hole', distance_to_hole_before: 20, distance_unit_before: 'feet', distance_to_hole_after: 0, putt_made: true }));
        continue;
      }
      shots.push(
        mkShot(r.id, h, 2, {
          lie_after: 'rough',
          result: 'rough',
          miss_direction: d === 'none' ? null : d,
          distance_to_hole_after: 15,
          distance_unit_after: 'yards',
        }),
      );
      let n = 3;
      shots.push(mkShot(r.id, h, n, { shot_type: 'around_green', lie_before: 'rough', lie_after: 'green', result: 'green', distance_to_hole_before: 15, distance_to_hole_after: 8, distance_unit_after: 'feet' }));
      if (opts.gap?.(k)) n += 1; // a skipped shot number → incomplete record
      const putts = opts.putts(d, k);
      for (let p = 1; p <= putts; p++) {
        n += 1;
        const last = p === putts;
        shots.push(
          mkShot(r.id, h, n, {
            shot_type: 'putting',
            lie_before: 'green',
            lie_after: 'green',
            result: last ? 'hole' : 'green',
            // First putt starts where the chip finished (8 ft); later ones from 2 ft.
            distance_to_hole_before: p === 1 ? 8 : 2,
            distance_unit_before: 'feet',
            distance_to_hole_after: last ? 0 : 2,
            distance_unit_after: 'feet',
            putt_made: last,
          }),
        );
      }
    }
  }
  return mkData(rounds, holes, shots);
}

const PATTERN: Dir[] = ['hit', 'short', 'hit', 'long', 'hit', 'short_left', 'hit', 'left', 'right'];

describe('sidesOf', () => {
  it('collapses 8 directions onto two axes; a diagonal counts on both', () => {
    expect(sidesOf('short')).toEqual(['short']);
    expect(sidesOf('short_left')).toEqual(['short', 'left']);
    expect(sidesOf('long_right')).toEqual(['long', 'right']);
    expect(sidesOf(null)).toEqual([]);
    expect(sidesOf('fat')).toEqual([]);
  });
});

describe('computeApproachCompass', () => {
  it('returns null without approaches', () => {
    expect(computeApproachCompass(mkData([mkRound(0)], [], []))).toBeNull();
  });

  it('finds the costlier side of an axis from the recovery cost', () => {
    // Short misses (incl. short_left) take 2 putts after the chip; everything else 1.
    const r = computeApproachCompass(build({ pattern: PATTERN, putts: (d) => (d === 'short' || d === 'short_left' ? 2 : 1) }))!;
    expect(r.sides.short.misses).toBe(r.sides.short.costed);
    expect(r.sides.short.recovery_cost!).toBeGreaterThan(r.sides.long.recovery_cost!);
    expect(r.sides.short.recovery_cost! - r.sides.long.recovery_cost!).toBeCloseTo(1, 1);
    expect(r.axes.depth.worse).toBe('short');
    // A short-left miss counts on both axes: short = short + short_left,
    // left = left + short_left (8 rounds × 2 per 9-hole cycle = 32 each).
    expect(r.sides.short.misses).toBe(32);
    expect(r.sides.left.misses).toBe(32);
    expect(r.sides.long.misses).toBe(16);
    expect(r.coverage_pct).toBe(100);
  });

  it('qualifies with variance, gates, and sizes on the costlier side per 18', () => {
    const r = computeApproachCompass(
      build({ rounds: 10, pattern: PATTERN, putts: (d, k) => (d === 'short' || d === 'short_left' ? 2 + (k % 2) : 1 + (k % 3 === 0 ? 1 : 0)) }),
    )!;
    expect(r.axes.depth.qualifies).toBe(true);
    expect(r.lead).toBe('depth');
    const ax = r.axes.depth;
    expect(ax.cost_per_round).toBeCloseTo(ax.gap_per_miss! * ax.worse_per_18, 1);
    expect(r.examples.length).toBeGreaterThan(0);
    expect(r.examples.length).toBeLessThanOrEqual(5);
    expect(r.examples[0]!.note).toContain('missed short');
  });

  it('gates on misses per side (12)', () => {
    const r = computeApproachCompass(build({ rounds: 2, pattern: PATTERN, putts: (d, k) => (d === 'short' ? 2 + (k % 2) : 1 + (k % 2)) }))!;
    expect(r.sides.long.costed).toBeLessThan(12);
    expect(r.axes.depth.qualifies).toBe(false);
  });

  it('gates on miss-direction coverage and counts missing directions (not zero)', () => {
    const pattern: Dir[] = ['short', 'none', 'long', 'none', 'hit'];
    const r = computeApproachCompass(build({ rounds: 10, pattern, putts: (d, k) => (d === 'short' ? 2 + (k % 2) : 1 + (k % 2)) }))!;
    expect(r.excluded.no_direction).toBeGreaterThan(0);
    expect(r.coverage_pct).toBeLessThan(80);
    expect(r.missed_greens).toBe(r.direction_recorded + r.excluded.no_direction);
    expect(r.qualifies).toBe(false);
  });

  it('excludes misses whose recovery record has a gap in shot numbers, and counts them', () => {
    const r = computeApproachCompass(build({ pattern: PATTERN, putts: () => 1, gap: (k) => k % 2 === 0 }))!;
    expect(r.excluded.recovery_incomplete).toBeGreaterThan(0);
    expect(r.sides.short.costed).toBeLessThan(r.sides.short.misses);
  });

  it('costs only the last approach on a hole', () => {
    const data = build({ rounds: 1, pattern: ['short'], putts: () => 1 });
    // Insert a second missed approach before the recorded one on hole 1 (renumber).
    const extra = mkShot('r0', 1, 2, { lie_after: 'rough', result: 'rough', miss_direction: 'long', distance_to_hole_after: 40, distance_unit_after: 'yards' });
    data.shots = data.shots.map((s) => (s.round_id === 'r0' && s.hole_number === 1 && s.shot_number >= 2 ? { ...s, shot_number: s.shot_number + 1 } : s));
    data.shots.push(extra);
    const r = computeApproachCompass(data)!;
    expect(r.excluded.earlier_miss_on_hole).toBe(1);
    // Coverage population = last-approach misses only.
    expect(r.missed_greens).toBe(r.direction_recorded + r.excluded.no_direction);
    expect(r.coverage_pct).toBe(100);
  });

  it('scales misses to per 18 on 9-hole rounds', () => {
    const r = computeApproachCompass(
      build({ rounds: 20, holes: 9, pattern: PATTERN, putts: (d, k) => (d === 'short' || d === 'short_left' ? 2 + (k % 2) : 1 + (k % 3 === 0 ? 1 : 0)) }),
    )!;
    const r18 = computeApproachCompass(
      build({ rounds: 10, pattern: PATTERN, putts: (d, k) => (d === 'short' || d === 'short_left' ? 2 + (k % 2) : 1 + (k % 3 === 0 ? 1 : 0)) }),
    )!;
    expect(r.axes.depth.worse_per_18).toBeCloseTo(r18.axes.depth.worse_per_18, 1);
  });
});

describe('composeApproachCompass', () => {
  it('humanized label, receipts with denominators, sized on own misses, short_game', () => {
    const r = computeApproachCompass(
      build({ rounds: 10, pattern: PATTERN, putts: (d, k) => (d === 'short' || d === 'short_left' ? 2 + (k % 2) : 1 + (k % 3 === 0 ? 1 : 0)) }),
    )!;
    const c = composeApproachCompass(toCompassAggregate(r, 74)!);
    const ev = c.evidence as typeof c.evidence & { counterfactual: { strokes_saved_per_round: number; attempts_used: number } };
    expect(ev.metric).toBe('approach_miss_recovery_cost');
    expect(ev.metric_label).toBe('Extra strokes to finish a hole after missing the green short');
    expect(ev.comparison_source).toBe('your_baseline');
    expect(c.category).toBe('short_game');
    expect(c.signature).toBe('approach_miss_compass:depth:short');
    expect(ev.counterfactual.attempts_used).toBeCloseTo(r.axes.depth.worse_per_18, 1);
    expect(ev.diagnosis?.causality_level).toBe('inferred_hypothesis');
    const receipts = (ev.detail as { receipts: { samples: Record<string, number>; exclusions: Record<string, number>; examples: unknown[] } }).receipts;
    expect(receipts.samples.missed_greens).toBe(r.missed_greens);
    expect(receipts.exclusions).toHaveProperty('misses_without_complete_recovery_record');
    expect(c.content).toContain('a diagonal miss counts on both axes');
    expect(c.content).not.toMatch(/iron|wedge|nerves|swing/i);
    expect(new ApproachMissCompassGenerator(PLAYER).category).toBe('short_game');
  });

  it('toCompassAggregate is null when nothing qualifies', () => {
    expect(toCompassAggregate(computeApproachCompass(build({ rounds: 2, pattern: PATTERN, putts: () => 1 })), 74)).toBeNull();
  });
});
