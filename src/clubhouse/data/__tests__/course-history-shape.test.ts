import { describe, expect, it } from 'vitest';
import { averageArc, FALLBACK_HOLE_SD, holeStats, nineOf, ownHoleSd, playsCompared, stretches, STRETCH_Z, type ChCardHole, type ChHolePlay } from '../course-history-shape';
import type { ChPlayHole } from '../stats-extra';

const play = (score: number, over: Partial<ChHolePlay> = {}): ChHolePlay => ({ score, par: 4, putts: 2, gir: true, fairway: true, roundId: 'r', date: '2026-10-01', ...over });
const round = (toPar: number[] = []): ChPlayHole[] =>
  Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, score: 4 + (toPar[i] ?? 0), putts: 2, gir: true, fairway: true }));

describe('holeStats', () => {
  it('one play is the score alone, untoned; colour only from five plays past two SE', () => {
    expect(FALLBACK_HOLE_SD).toBeCloseTo(3.6 / Math.sqrt(18), 6);
    expect(holeStats([play(5)])).toMatchObject({ n: 1, state: 'once', tint: 'l', avg: 1 });
    // Four plays at +1 is an early read: no colour, however clear.
    expect(holeStats(Array(4).fill(play(5)))).toMatchObject({ state: 'early', tint: 'l', avg: 1 });
    // Six plays at +1: SE 0.85/√6 ≈ 0.35, past 2 SE: tier 2 over.
    expect(holeStats(Array(6).fill(play(5)))).toMatchObject({ state: 'ok', tint: 'o2', avg: 1 });
    // Ten plays at −0.3: 2 SE ≈ 0.54, inside it: level (it tinted at 1 SE before).
    expect(holeStats([...Array(3).fill(play(3)), ...Array(7).fill(play(4))]).tint).toBe('l');
    // Twenty plays at −0.4: 2 SE ≈ 0.38, past it, under half a stroke: tier 1 under.
    expect(holeStats([...Array(8).fill(play(3)), ...Array(12).fill(play(4))]).tint).toBe('u1');
    // A tighter own spread tints sooner.
    expect(holeStats([...Array(3).fill(play(3)), ...Array(7).fill(play(4))], 0.4).tint).toBe('u1');
  });

  it('measures the player’s own hole spread from 30 degrees of freedom, else the fallback', () => {
    const hole = (scores: number[]) => scores.map((x) => play(x));
    expect(ownHoleSd([hole([4, 5]), hole([3, 4])])).toBe(FALLBACK_HOLE_SD);
    const many = Array.from({ length: 18 }, () => hole([4, 5, 4]));
    // 18 holes × 2 df = 36; each hole's SD is √(1/3).
    expect(ownHoleSd(many)).toBeCloseTo(Math.sqrt(1 / 3), 6);
    expect(ownHoleSd(Array.from({ length: 18 }, () => hole([4, 4, 4])))).toBe(FALLBACK_HOLE_SD);
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
  // Rounds that vary a little hole to hole, so their spread is measured, with a costly 13 to 15 and a good 16 to 18.
  const noisy = (k: number) => round([k % 2, 0, -(k % 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 1 + (k % 2), 1, 1, -1, -1 - (k % 2), -1]);

  it('needs five full rounds, and measures each stretch against the player’s own usual', () => {
    expect(stretches([noisy(0), noisy(1), noisy(2), noisy(3)])).toEqual({ worst: null, best: null });
    const s = stretches([0, 1, 2, 3, 4, 5].map(noisy));
    expect(s.worst!.from).toBe(13);
    expect(s.best!.from).toBe(16);
    // These rounds total level, so the excess is the stretch itself: 3 or 4 a round, 3.5 on average.
    expect(s.worst!.avg).toBeCloseTo(3.5, 6);
    expect(s.worst!.avg).toBeGreaterThan(STRETCH_Z * s.worst!.se);
  });

  it('a player over par everywhere sees no stretch as costly, and noise inside 2.6 SE says nothing', () => {
    expect(stretches(Array(6).fill(round(Array(18).fill(1))))).toEqual({ worst: null, best: null });
    expect(stretches([round(), round(), round(), round(), round()])).toEqual({ worst: null, best: null });
    const shaky = [round([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]), round(), round(), round(), round([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1])];
    expect(stretches(shaky).worst).toBeNull();
  });
});

describe('playsCompared', () => {
  it('needs three rounds a side, then says harder only past one SE of the difference', () => {
    expect(playsCompared([2, 3], [0, 0, 0])).toEqual({ needs: 'here' });
    expect(playsCompared([2, 3, 4], [0, 0])).toEqual({ needs: 'elsewhere' });
    // Inside one SE with a wide SE (about 1.2 here): no clear difference yet, not "the same".
    expect(playsCompared([2, 3, 4], [1, 2, 3])).toMatchObject({ words: 'unclear' });
    // A tight one (six rounds a side, own spread 0.55, SE about 0.3): about the same.
    expect(playsCompared([2, 2, 3, 3, 2, 3], [2, 3, 2, 3, 3, 2])).toMatchObject({ words: 'same' });
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

describe('nineOf', () => {
  const card = new Map<number, ChCardHole>(Array.from({ length: 18 }, (_, i) => [i + 1, { par: i === 2 || i === 11 ? 3 : i === 6 || i === 15 ? 5 : 4, yards: 300 + i * 10 }]));
  const nine = (offset: number, yards = true) => Array.from({ length: 9 }, (_, i) => ({ n: i + 1, par: card.get(i + 1 + offset)!.par, yards: yards ? card.get(i + 1 + offset)!.yards : null }));

  it('places a nine by its pars and yardages, back nines stored as 1 to 9 included', () => {
    expect(nineOf(nine(0), card)).toBe('front');
    expect(nineOf(nine(9), card)).toBe('back');
  });

  it('leaves the nine unplaced when both sides fit or neither does, or with no card', () => {
    // Pars alone are the same both sides on this card: no yardages, no call.
    expect(nineOf(nine(0, false), card)).toBeNull();
    expect(nineOf(nine(0).map((h) => ({ ...h, yards: h.yards! + 40 })), card)).toBeNull();
    expect(nineOf(nine(0), null)).toBeNull();
  });
});
