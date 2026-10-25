import { describe, expect, it } from 'vitest';
import { compareRounds, type ChCompareCard } from '../compare-rounds';

const card = (id: string, date: string, extra: Record<number, number>): ChCompareCard => {
  const scores = Array.from({ length: 18 }, (_, i) => 4 + (extra[i + 1] ?? 0));
  return { id, date, score: scores.reduce((a, s) => a + s, 0), scores, pars: Array(18).fill(4) };
};

describe('compareRounds (P-7 4.2.7)', () => {
  it('says how far apart and where most of it came from', () => {
    const r = compareRounds(card('a', '2026-10-03', { 13: 2, 14: 1, 15: 1, 2: 2 }), card('b', '2026-03-14', {}));
    expect(r.summary).toBe('Oct 3 was 6 shots worse · most on 13 to 15 (+4)');
    expect(r.cells[12]).toEqual({ n: 13, a: 6, b: 4, better: 'b' });
    expect(r.cells[0]!.better).toBe('level');
    expect(r.cumA[17]).toBe(6);
    expect(r.cumB[17]).toBe(0);
  });

  it('better and level read the same way', () => {
    expect(compareRounds(card('a', '2026-10-03', { 5: -1 }), card('b', '2026-03-14', {})).summary).toBe('Oct 3 was 1 shot better · most on 3 to 5 (−1)');
    expect(compareRounds(card('a', '2026-10-03', {}), card('b', '2026-03-14', {})).summary).toBe('Oct 3 and Mar 14 were level');
  });
});
