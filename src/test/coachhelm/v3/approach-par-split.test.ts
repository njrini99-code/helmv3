/**
 * The 175+ yd approach bucket pools two different shots and reports them as one.
 *
 * Measured against production 2026-08-18, every approach from 175+ yards taken
 * from fairway or rough:
 *
 *     hole par   shots   avg yds out   found the green
 *     par 4        341       201            27.9%
 *     par 5      1,094       241            15.8%
 *
 * Par 5s are 76% of the bucket and convert twelve points worse. That is not a
 * skill gap, it is a different shot: at 241 yards on a par 5 the play is often
 * a deliberate lay-up to a wedge number, and a lay-up that finishes in the
 * fairway is recorded here as an approach that missed the green.
 *
 * So "175+ yd approach: 16% greens hit" is mostly a par-5 second-shot
 * statistic wearing an approach label, and it makes every player look worse at
 * long approaches than they are when they are actually hunting a green. The
 * generator never sees `par` at all — `ApproachShot` doesn't carry it and
 * `loadApproachShots` doesn't join `golf_holes`.
 *
 * This does NOT try to infer intent. A par-5 second shot at 175 can be a
 * genuine go-for-it, and nothing in the data says which. It reports the split
 * and lets the coach read it, rather than silently averaging the two.
 */
import { describe, it, expect } from 'vitest';
import { parSplit, parMixSentence } from '@/lib/coachhelm/v3/generators/approach-miss';
import type { ApproachShot } from '@/lib/coachhelm/v3/engine/shot-source';

function shot(par: number | null, foundGreen: boolean, i = 0): ApproachShot {
  return {
    round_id: `r${i}`,
    hole_number: 1,
    shot_number: 2,
    distance_to_hole_before: 200,
    distance_to_hole_after: foundGreen ? 25 : 40,
    distance_unit_after: 'feet',
    distance_unit_before: 'yards',
    lie_before: 'fairway',
    lie_after: foundGreen ? 'green' : 'rough',
    result: foundGreen ? 'green' : 'rough',
    is_penalty: false,
    miss_direction: null,
    par,
  };
}

function many(par: number | null, greens: number, total: number): ApproachShot[] {
  return Array.from({ length: total }, (_, i) => shot(par, i < greens, i));
}

describe('parSplit', () => {
  it('separates par-4 from par-5 attempts and rates them independently', () => {
    const split = parSplit([...many(4, 5, 10), ...many(5, 1, 10)]);

    expect(split.par4.attempts).toBe(10);
    expect(split.par4.greenHitPct).toBeCloseTo(50, 5);
    expect(split.par5.attempts).toBe(10);
    expect(split.par5.greenHitPct).toBeCloseTo(10, 5);
  });

  it('counts shots with an unknown par separately rather than assuming one', () => {
    const split = parSplit([...many(4, 1, 3), ...many(null, 0, 4)]);

    expect(split.par4.attempts).toBe(3);
    expect(split.par5.attempts).toBe(0);
    expect(split.unknown).toBe(4);
  });

  it('reports a null rate rather than 0% when a side has no attempts', () => {
    const split = parSplit(many(4, 2, 4));
    expect(split.par5.attempts).toBe(0);
    expect(split.par5.greenHitPct).toBeNull();
  });

  it('ignores par 3 — an approach from 175+ on a par 3 is the tee shot', () => {
    const split = parSplit([...many(3, 1, 6), ...many(4, 2, 4)]);
    expect(split.par4.attempts).toBe(4);
    expect(split.par5.attempts).toBe(0);
    expect(split.unknown).toBe(6);
  });
});

describe('parMixSentence — states the split, never infers intent', () => {
  it('names the par-5 share and the par-4 rate when par 5s dominate', () => {
    // Production shape: 1094 par-5 vs 341 par-4, 15.8% vs 27.9%.
    const split = parSplit([...many(5, 173, 1094), ...many(4, 95, 341)]);
    const sentence = parMixSentence(split);

    expect(sentence).not.toBeNull();
    expect(sentence).toMatch(/76%/);         // par-5 share of the bucket
    expect(sentence).toMatch(/28%/);         // the par-4 rate, the honest one
    expect(sentence).toMatch(/lay(ing)? up/i);
  });

  it('says nothing when the mix is balanced — no split worth reporting', () => {
    const split = parSplit([...many(4, 3, 10), ...many(5, 2, 10)]);
    expect(parMixSentence(split)).toBeNull();
  });

  it('says nothing when the minority side is too thin to state a rate', () => {
    // 30 par-5 shots but only 2 par-4 — a 2-shot rate is not a number.
    const split = parSplit([...many(5, 5, 30), ...many(4, 1, 2)]);
    expect(parMixSentence(split)).toBeNull();
  });

  it('says nothing when every shot has an unknown par', () => {
    expect(parMixSentence(parSplit(many(null, 3, 20)))).toBeNull();
  });
});
