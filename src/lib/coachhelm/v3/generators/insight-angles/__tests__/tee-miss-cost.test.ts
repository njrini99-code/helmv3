import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import { TeeMissCostGenerator, composeTeeMiss, computeTeeMiss, toTeeMissAggregate } from '../tee-miss-cost';
import type { AngleHole, AngleShot } from '../angle-data';
import { PLAYER, mkData, mkHole, mkRound, mkShot } from './fixtures';

type Outcome = 'fairway' | 'left' | 'right' | 'unrecorded';

/**
 * `rounds` rounds of `holes` par-4 holes. Holes cycle fairway / left / right
 * per `pattern`; score to par per outcome comes from `toPar`, with a small
 * per-round wobble so the Welch test has variance.
 */
function build(opts: {
  rounds?: number;
  holes?: 9 | 18;
  pattern: Outcome[];
  toPar: Record<Exclude<Outcome, 'unrecorded'>, number>;
  penaltyLeft?: boolean;
  /** Add an approach after each tee shot (for the next-shot SG). */
  withApproach?: boolean;
}) {
  const rounds = Array.from({ length: opts.rounds ?? 6 }, (_, i) => mkRound(i, { holes: opts.holes ?? 18 }));
  const holes: AngleHole[] = [];
  const shots: AngleShot[] = [];
  let k = 0;
  for (const [ri, r] of rounds.entries()) {
    for (let h = 1; h <= (opts.holes ?? 18); h++) {
      const o = opts.pattern[k % opts.pattern.length]!;
      k += 1;
      const wobble = (ri % 3) - 1; // -1, 0, 1 by round, the same for every side
      const toPar = o === 'unrecorded' ? opts.toPar.left : opts.toPar[o] + wobble * 0.5 >= 0 ? Math.round(opts.toPar[o] + wobble * 0.5) : 0;
      const penalty = o === 'left' && opts.penaltyLeft && h % 4 === 0 ? 1 : 0;
      holes.push(mkHole(r.id, h, { score: 4 + toPar, fairway_hit: o === 'fairway', penalty_strokes: penalty, gir: o === 'fairway' }));
      shots.push(
        mkShot(r.id, h, 1, {
          shot_type: 'tee',
          club_type: Math.floor((k - 1) / 6) % 2 ? 'driver' : 'non_driver',
          lie_before: 'tee',
          lie_after: o === 'fairway' ? 'fairway' : 'rough',
          result: o === 'fairway' ? 'fairway' : 'rough',
          miss_direction: o === 'left' || o === 'right' ? o : null,
          distance_to_hole_before: 400,
          distance_to_hole_after: 150,
          distance_unit_after: 'yards',
        }),
      );
      if (opts.withApproach) {
        shots.push(
          mkShot(r.id, h, 2, {
            shot_type: 'approach',
            lie_before: o === 'fairway' ? 'fairway' : 'rough',
            distance_to_hole_before: 150,
            distance_unit_before: 'yards',
            lie_after: 'green',
            result: 'green',
            distance_to_hole_after: o === 'fairway' ? 20 : 40,
            distance_unit_after: 'feet',
          }),
        );
      }
    }
  }
  return mkData(rounds, holes, shots);
}

const PATTERN: Outcome[] = ['fairway', 'left', 'fairway', 'right', 'fairway', 'left'];

describe('computeTeeMiss', () => {
  it('returns null without tee shots', () => {
    expect(computeTeeMiss(mkData([mkRound(0)], [], []))).toBeNull();
  });

  it('finds the costlier side, measured against fairway holes in the same par × driver stratum', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    expect(r.worse).toBe('left');
    expect(r.better).toBe('right');
    expect(r.sides.left.cost_vs_fairway!).toBeGreaterThan(r.sides.right.cost_vs_fairway!);
    expect(r.coverage_pct).toBe(100);
    expect(r.qualifies).toBe(true);
    // 36 left misses over 108 holes → 6 per 18.
    expect(r.worse_per_18).toBe(6);
    expect(r.cost_per_round).toBeCloseTo(r.gap_per_miss! * 6, 1);
  });

  it('does not qualify when the sides cost the same', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1, right: 1 } }))!;
    expect(r.qualifies).toBe(false);
  });

  it('gates on miss-side coverage (80%)', () => {
    const pattern: Outcome[] = ['fairway', 'left', 'unrecorded', 'right', 'fairway', 'left', 'unrecorded', 'right'];
    const r = computeTeeMiss(build({ rounds: 8, pattern, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    expect(r.coverage_pct).toBeLessThan(80);
    expect(r.excluded.other_outcome).toBeGreaterThan(0);
    expect(r.qualifies).toBe(false);
  });

  it('gates on misses per side (12)', () => {
    const r = computeTeeMiss(build({ rounds: 2, pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    expect(r.sides.right.costed).toBeLessThan(12);
    expect(r.qualifies).toBe(false);
  });

  it('keeps penalty misses on their side and counts them', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 }, penaltyLeft: true }))!;
    expect(r.sides.left.penalties).toBeGreaterThan(0);
    expect(r.sides.right.penalties).toBe(0);
  });

  it('scales misses to per 18 on 9-hole rounds', () => {
    const r = computeTeeMiss(build({ rounds: 12, holes: 9, pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    expect(r.worse_per_18).toBe(6);
  });
});

describe('compass and driver chain', () => {
  it('next-shot SG per side is null and counted as missing without a next shot (not zero)', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    expect(r.sides.left.next_shot_sg).toBeNull();
    expect(r.sides.left.next_shot_sg_missing).toBe(r.sides.left.shots);
    const c = composeTeeMiss(toTeeMissAggregate(r, 74)!);
    expect(c.content).toContain('n/a (n=0)');
  });

  it('computes next-shot SG when the approach is recorded', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 }, withApproach: true }))!;
    expect(r.sides.left.next_shot_sg_n).toBeGreaterThan(0);
    expect(r.sides.left.next_shot_sg).not.toBeNull();
    expect(r.sides.left.approach_yards).toBe(150);
  });

  it('builds the driver vs non-driver chain per par with a selection-bias note', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    const cells = r.club_chain.map((c) => `${c.par}|${c.club}`).sort();
    expect(cells).toEqual(['4|driver', '4|non_driver']);
    const total = r.club_chain.reduce((a, c) => a + c.tee_shots, 0);
    expect(total).toBe(r.tee_shots);
    const d = r.club_chain[0]!;
    expect(d.fairway_pct! + d.left_pct! + d.right_pct!).toBeCloseTo(100, 0);
    const c = composeTeeMiss(toTeeMissAggregate(r, 74)!);
    const detail = c.evidence.detail as { selection_bias_note: string; compass: unknown[]; receipts: { examples: { note: string }[] } };
    expect(detail.selection_bias_note).toMatch(/selection|choose/i);
    expect(detail.compass).toHaveLength(3);
    expect(detail.receipts.examples.length).toBeLessThanOrEqual(5);
    expect(detail.receipts.examples[0]!.note).toContain('left miss');
  });
});

describe('composeTeeMiss', () => {
  it('states coverage, compares with the other side, sizes on own misses', () => {
    const r = computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1.5, right: 0.5 } }))!;
    const agg = toTeeMissAggregate(r, 74)!;
    const c = composeTeeMiss(agg);
    const ev = c.evidence as typeof c.evidence & { counterfactual: { strokes_saved_per_round: number; attempts_used: number } };
    expect(ev.metric).toBe('tee_miss_next_shot_cost');
    expect(ev.comparison_source).toBe('your_baseline');
    expect(c.content).toContain('Miss side recorded on 54 of 54 missed fairways');
    expect(c.content).not.toMatch(/iron|wedge|hybrid|wood/i);
    expect(ev.counterfactual.attempts_used).toBe(6);
    expect(ev.counterfactual.strokes_saved_per_round).toBeCloseTo(Math.min(2.5, r.cost_per_round), 1);
    expect(c.signature).toBe('tee_miss_cost:left');
    expect(ev.diagnosis?.causality_level).toBe('inferred_hypothesis');
    expect(new TeeMissCostGenerator(PLAYER).category).toBe('tee');
  });

  it('toTeeMissAggregate is null when nothing qualifies', () => {
    expect(toTeeMissAggregate(computeTeeMiss(build({ pattern: PATTERN, toPar: { fairway: 0, left: 1, right: 1 } })), 74)).toBeNull();
  });
});
