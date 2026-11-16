import { describe, expect, it } from 'vitest';
import { countsInAverages, roundKindOf } from '../round-scope';
import { inAverages } from '../rounds-shape';
import { pressureGap } from '../stats-figures';
import type { ChRound } from '../season';

/*
 * Launch readiness 2026-11-15, DF-C-18: a round with no type was read three ways. The averages counted it, Home's latest rounds called
 * it practice, and Stats' pressure gap left it out. One reading now: a scoring round of no named kind (`roundKindOf` is null), in the
 * averages, never an event's row, and on neither side of the gap.
 */

const round = (id: string, round_type: string | null, toPar: number): ChRound =>
  ({ id, player_id: 'p1', round_date: '2026-10-01', round_type, total_score: 72 + toPar, score_to_par: toPar, holes_played: 18 }) as unknown as ChRound;

describe('one reading of a round’s type (DF-C-18)', () => {
  it('no type is no named kind and counts in the averages; an unknown type is practice', () => {
    expect(roundKindOf({ round_type: null })).toBeNull();
    expect(roundKindOf({ round_type: 'qualifying' })).toBe('qualifier');
    expect(roundKindOf({ round_type: 'casual' })).toBe('practice');
    expect([null, 'tournament', 'qualifier', 'practice', 'casual'].map((t) => countsInAverages({ round_type: t }))).toEqual([true, true, true, false, false]);
    // The rounds list's own copy of the rule is the same rule.
    for (const t of [null, 'tournament', 'qualifier', 'practice', 'casual']) expect(inAverages(t)).toBe(countsInAverages({ round_type: t }));
  });

  it('the pressure gap sets named competition against practice, and a round with no type on neither side', () => {
    const rounds = [round('t1', 'tournament', 4), round('t2', 'tournament', 6), round('q1', 'qualifier', 5), round('p1', 'practice', 1), round('p2', 'practice', 2), round('p3', 'practice', 3), round('n1', null, -8), round('n2', null, -8)];
    const gap = pressureGap(rounds);
    expect([gap.pressureRounds, gap.practiceRounds]).toEqual([3, 3]);
    expect(gap.gap).toBeCloseTo(5 - 2, 9);
  });
});
