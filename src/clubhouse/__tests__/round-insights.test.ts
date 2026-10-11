import { describe, expect, it } from 'vitest';
import { PREVIEW_REVIEW } from '../preview/fixtures-round-review';
import type { ChReviewHole } from '../data/round-review-shape';
import { approachFinish, costliest, feetOf, firstPutts, flow, headline, parSplit, puttBands, puttSplit, resultOf, teeMisses, trail, yardsOf } from '../screens/rounds/round-insights';

/** Round review (P011): what a round's holes and shots say, read from the fixture round (Finley GC, 74, +2). */
const hole = (n: number, par: number, score: number | null, extra: Partial<ChReviewHole> = {}): ChReviewHole => ({ n, par, yards: 400, score, putts: 2, fairway: null, gir: null, penalties: 0, shots: [], ...extra });

describe('round insights', () => {
  it('names each hole by its score against par', () => {
    expect([resultOf(3, 5), resultOf(4, 5), resultOf(5, 5), resultOf(6, 5), resultOf(8, 5)]).toEqual(['eagle', 'birdie', 'par', 'bogey', 'double']);
  });

  it('runs the score to par hole by hole, and leaves a hole with no score out', () => {
    const pts = flow([hole(1, 4, 5), hole(2, 4, null), hole(3, 3, 2), hole(4, 5, 5)]);
    expect(pts.map((p) => p.n)).toEqual([1, 3, 4]);
    expect(pts.map((p) => p.cum)).toEqual([1, 0, 0]);
    const round = flow(PREVIEW_REVIEW.holes);
    expect(round).toHaveLength(18);
    expect(round[17]!.cum).toBe(PREVIEW_REVIEW.toPar);
  });

  it('lists the holes that cost the most, worst first and only over par', () => {
    const c = costliest([hole(1, 4, 4), hole(2, 4, 7), hole(3, 4, 5), hole(4, 3, 5)], 3);
    expect(c.map((p) => [p.n, p.delta])).toEqual([
      [2, 3],
      [4, 2],
      [3, 1],
    ]);
  });

  it('averages each par and leaves a par with no hole null', () => {
    const s = parSplit([hole(1, 4, 5), hole(2, 4, 4), hole(3, 3, 3)]);
    expect(s.find((x) => x.par === 4)!.avg).toBe(0.5);
    expect(s.find((x) => x.par === 5)!.avg).toBeNull();
  });

  it('splits the putts into one, two and three-plus holes', () => {
    expect(puttSplit([hole(1, 4, 4, { putts: 1 }), hole(2, 4, 5, { putts: 3 }), hole(3, 4, 4, { putts: 2 })])).toMatchObject({ one: 1, two: 1, three: 1, holes: 3, perHole: 2 });
    expect(puttSplit([hole(1, 4, 4, { putts: null })])).toBeNull();
  });

  it('reads distances as yards or feet', () => {
    expect(yardsOf('518 yds')).toBe(518);
    expect(yardsOf('24 ft')).toBe(8);
    expect(yardsOf('1,204 yds')).toBe(1204);
    expect(yardsOf('far')).toBeNull();
    expect(feetOf('24 ft')).toBe(24);
    expect(feetOf('24 yds')).toBeNull();
  });

  it('finds each first putt, its length and whether it dropped, and groups them by length', () => {
    const putts = firstPutts(PREVIEW_REVIEW.holes);
    expect(putts.length).toBe(18);
    const made = putts.filter((p) => p.made).length;
    expect(made).toBe(PREVIEW_REVIEW.holes.filter((h) => h.putts === 1).length);
    const bands = puttBands(PREVIEW_REVIEW.holes);
    expect(bands.reduce((a, b) => a + b.attempts, 0)).toBe(18);
    expect(bands.reduce((a, b) => a + b.made, 0)).toBe(made);
  });

  it('averages where approaches finished and names the closest', () => {
    const a = approachFinish(PREVIEW_REVIEW.holes)!;
    expect(a.n).toBeGreaterThan(0);
    expect(a.best).toBeLessThanOrEqual(a.avg);
    expect(approachFinish([hole(1, 4, 4)])).toBeNull();
  });

  it('counts the sides tee shots missed the fairway', () => {
    const m = teeMisses(PREVIEW_REVIEW.holes);
    expect(m.left + m.right + m.other).toBe(PREVIEW_REVIEW.holes.filter((h) => h.fairway === false).length);
  });

  it('lays a hole’s shots along its length, tee to pin, and counts the putts at the pin', () => {
    const t = trail(PREVIEW_REVIEW.holes.find((h) => h.n === 2)!)!;
    expect(t.steps.map((s) => s.kind)).toEqual(['Tee', 'Approach', 'Approach']);
    expect(t.steps.every((s) => s.from >= 0 && s.to <= 1 && s.to >= s.from)).toBe(true);
    expect(t.putts).toBe(3);
    expect(t.firstPutt).toBe(19);
    expect(trail(hole(1, 4, 4, { yards: null }))).toBeNull();
  });

  it('says in a line which leg carried the round and which gave strokes back', () => {
    expect(headline(PREVIEW_REVIEW)).toBe('Approach gained +1.3, putting gave back 0.9.');
    expect(headline({ ...PREVIEW_REVIEW, strokesGained: null })).toBe('2 birdies, no double or worse.');
  });
});
