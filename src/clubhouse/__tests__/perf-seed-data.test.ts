import { describe, expect, it } from 'vitest';
import { PAR_LAYOUTS, genRound, girOf, makeRng, simHole, yardsFor } from '../../../e2e/helpers/clubhouse-team-data';

/**
 * The Clubhouse perf seed's round generator (e2e/helpers/clubhouse-team-data.ts): the rows must agree with each other the way a tracked
 * round does, or Stats reads them as a failed or inconsistent round and the harness measures a fallback instead of the page.
 */

const yards = yardsFor(PAR_LAYOUTS[0]!, makeRng(1));
const round = (seed: number, over: Partial<Parameters<typeof genRound>[1]> = {}) =>
  genRound(makeRng(seed), { shape: 'full', skill: 0.55, form: 0, withShots: true, layout: PAR_LAYOUTS[0]!, yards, ...over });

describe('perf seed: layouts', () => {
  it('every layout is a par 72 of 18 holes', () => {
    for (const layout of PAR_LAYOUTS) {
      expect(layout).toHaveLength(18);
      expect(layout.reduce((a, b) => a + b, 0)).toBe(72);
    }
  });
});

describe('perf seed: a hole', () => {
  it('has one shot per stroke, its putts as the putting rows, the last one holed, and the GIR rule of the golf_holes trigger', () => {
    const rng = makeRng(42);
    for (let i = 0; i < 400; i++) {
      const par = [3, 4, 5][i % 3]!;
      const h = simHole(rng, 1, par, par === 3 ? 170 : par === 4 ? 400 : 520, (i % 10) / 10);
      expect(h.shots).toHaveLength(h.score);
      const putts = h.shots.filter((s) => s.shot_type === 'putting');
      expect(putts).toHaveLength(h.putts);
      expect(putts[putts.length - 1]!.putt_made).toBe(true);
      expect(putts.slice(0, -1).every((p) => p.putt_made === false)).toBe(true);
      expect(h.gir).toBe(girOf(par, h.score, h.putts));
      expect(h.shots.map((s) => s.shot_number)).toEqual(h.shots.map((_, k) => k + 1));
      // The first stroke is the tee shot; a penalty hole has exactly the penalty rows its count says.
      expect(h.shots[0]!.shot_type).toBe('tee');
      expect(h.shots.filter((s) => s.shot_type === 'penalty')).toHaveLength(h.penalty_strokes);
    }
  });

  it('reads putts only on the green, in feet, within the 120 feet the loaders accept', () => {
    const h = simHole(makeRng(7), 2, 4, 410, 0.5);
    for (const p of h.shots.filter((s) => s.shot_type === 'putting')) {
      expect(p.distance_unit_before).toBe('feet');
      expect(p.putt_distance_feet).toBeGreaterThan(0);
      expect(p.putt_distance_feet!).toBeLessThanOrEqual(120);
    }
  });
});

describe('perf seed: a round', () => {
  it('adds up: the nines are the holes, the total is the nines, the round counters are the holes', () => {
    const r = round(11);
    expect(r.holes).toHaveLength(18);
    expect(r.front_nine! + r.back_nine!).toBe(r.total_score);
    expect(r.holes.reduce((a, h) => a + h.score, 0)).toBe(r.total_score);
    expect(r.score_to_par).toBe(r.total_score - 72);
    expect(r.total_putts).toBe(r.holes.reduce((a, h) => a + h.putts, 0));
    expect(r.total_gir).toBe(r.holes.filter((h) => h.gir).length);
    expect(r.total_gir_possible).toBe(18);
    expect(r.total_fairways).toBe(r.holes.filter((h) => h.par >= 4).length);
  });

  it('is countable: a plausible score for 18 holes, and strokes gained inside the cap with legs that add up to the total', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = round(seed, { skill: (seed % 10) / 10 });
      expect(r.total_score).toBeGreaterThanOrEqual(50);
      expect(r.total_score).toBeGreaterThanOrEqual(18 + r.total_putts!);
      expect(Math.abs(r.strokes_gained_total!)).toBeLessThanOrEqual(15);
      const legs = r.strokes_gained_tee! + r.strokes_gained_approach! + r.strokes_gained_around_green! + r.strokes_gained_putting!;
      expect(legs).toBeCloseTo(r.strokes_gained_total!, 1);
    }
  });

  it('a round without shots keeps its holes and scores but has no shots and no strokes gained, and the same scores as with them', () => {
    const withShots = round(5);
    const without = round(5, { withShots: false });
    expect(without.holes.every((h) => h.shots.length === 0)).toBe(true);
    expect(without.strokes_gained_total).toBeNull();
    expect(without.total_score).toBe(withShots.total_score);
  });

  it('a nine-hole round records one nine and no back nine; a total-only round has neither nine and no holes', () => {
    const nine = round(3, { shape: 'nine' });
    expect(nine.holes_played).toBe(9);
    expect(nine.holes).toHaveLength(9);
    expect(nine.front_nine).toBe(nine.total_score);
    expect(nine.back_nine).toBeNull();
    const total = round(3, { shape: 'total', withShots: false });
    expect(total.holes).toHaveLength(0);
    expect(total.front_nine).toBeNull();
    expect(total.back_nine).toBeNull();
    expect(total.holes_played).toBe(18);
  });

  it('is deterministic for a seed and different for another', () => {
    expect(round(9).total_score).toBe(round(9).total_score);
    expect(JSON.stringify(round(9).holes)).toBe(JSON.stringify(round(9).holes));
    expect(JSON.stringify(round(9).holes)).not.toBe(JSON.stringify(round(10).holes));
  });
});
