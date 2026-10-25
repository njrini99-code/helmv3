import { describe, expect, it } from 'vitest';
import { averageArc, holeStats, playsCompared, POOLED_HOLE_SD, stretches, type ChHolePlay } from '../course-history-shape';
import type { ChPlayHole } from '../stats-extra';

const play = (score: number, over: Partial<ChHolePlay> = {}): ChHolePlay => ({ score, par: 4, putts: 2, gir: true, fairway: true, roundId: 'r', date: '2026-10-01', ...over });
const round = (toPar: number[] = []): ChPlayHole[] =>
  Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, score: 4 + (toPar[i] ?? 0), putts: 2, gir: true, fairway: true }));

describe('holeStats', () => {
  it('one play is the score alone, untoned; a clear average tints by tier', () => {
    expect(holeStats([play(5)])).toMatchObject({ n: 1, state: 'once', tint: 'l', avg: 1 });
    // Six plays at +1: SE 0.9/√6 ≈ 0.37, well clear: tier 2 over.
    expect(holeStats(Array(6).fill(play(5)))).toMatchObject({ state: 'ok', tint: 'o2', avg: 1 });
    // Two plays at −0.5 average: SE ≈ 0.64, inside the noise: level.
    expect(holeStats([play(3), play(4)]).tint).toBe('l');
    // Ten plays at −0.3: SE ≈ 0.28, past it, under half a stroke: tier 1 under.
    expect(holeStats([...Array(3).fill(play(3)), ...Array(7).fill(play(4))]).tint).toBe('u1');
  });

  it('counts fairways only on par 4s and 5s, and putts from two plays', () => {
    const s = holeStats([play(3, { par: 3, fairway: false }), play(4, { fairway: false, putts: 0 }), play(4, { gir: false })]);
    expect(s.fairways).toEqual([1, 2]);
    expect(s.greens).toEqual([2, 3]);
    expect(s.putts).toBe(2);
    expect(s.best).toBe(0);
  });
});

describe('stretches', () => {
  it('needs three full rounds, and names the costly and best three holes', () => {
    const r = round([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, -1, -1, -1]);
    expect(stretches([r, r])).toEqual({ worst: null, best: null });
    const s = stretches([r, r, r, r]);
    expect(s.worst).toMatchObject({ from: 13, avg: 3 });
    expect(s.best).toMatchObject({ from: 16, avg: -3 });
    expect(s.worst!.se).toBeCloseTo((POOLED_HOLE_SD * Math.sqrt(3)) / 2, 6);
  });

  it('says nothing when no stretch clears its noise', () => {
    expect(stretches([round(), round(), round()])).toEqual({ worst: null, best: null });
  });
});

describe('playsCompared', () => {
  it('needs three rounds a side, then says harder only past one SE of the difference', () => {
    expect(playsCompared([2, 3], [0, 0, 0])).toEqual({ needs: 'here' });
    expect(playsCompared([2, 3, 4], [0, 0])).toEqual({ needs: 'elsewhere' });
    expect(playsCompared([2, 3, 4], [1, 2, 3])).toMatchObject({ words: 'same' });
    expect(playsCompared([8, 9, 10], [1, 2, 3])).toMatchObject({ words: 'harder', diff: 7 });
    expect(playsCompared([1, 2, 3], [8, 9, 10])).toMatchObject({ words: 'easier', diff: -7 });
  });
});

describe('averageArc', () => {
  it('averages the running score over complete rounds, with a spread from five', () => {
    expect(averageArc([round()])).toBeNull();
    const arc = averageArc([round([1]), round([-1])])!;
    expect(arc.mean[0]).toBe(0);
    expect(arc.mean).toHaveLength(18);
    expect(arc.sd).toBeNull();
    const gap = round();
    gap[4] = { ...gap[4]!, score: null };
    expect(averageArc([round(), round(), gap])!.rounds).toBe(2);
    expect(averageArc(Array(5).fill(round()))!.sd).toHaveLength(18);
  });
});
