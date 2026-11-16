import { describe, expect, it } from 'vitest';
import { compareStandings, countback, rankStandings, type StandingKey } from '../ranking';

/** F-04: the one ranking order with a qualifier's tie rule. `coach` separates nobody (Q-114); `last_round` counts back. */

const key = (name: string, rounds: Array<number | null>, par = 72): StandingKey => {
  const played = rounds.filter((r): r is number => r != null);
  const total = played.reduce((s, r) => s + r, 0);
  return { name, rounds, played: played.length, total, toPar: total - par * played.length };
};

describe('countback (F-04)', () => {
  it('the lower last round decides, then the round before; level in every round both played is 0', () => {
    expect(countback({ rounds: [74, 70] }, { rounds: [70, 74] })).toBeLessThan(0);
    expect(countback({ rounds: [72, 70, 71] }, { rounds: [70, 72, 71] })).toBeLessThan(0);
    expect(countback({ rounds: [71, 71] }, { rounds: [71, 71] })).toBe(0);
    // A round only one of them has a score in is passed over, not counted as a win.
    expect(countback({ rounds: [70, null] }, { rounds: [72, 69] })).toBeLessThan(0);
    expect(countback({}, { rounds: [70] })).toBe(0);
  });
});

describe('rankStandings with a tie rule (F-04)', () => {
  const field = [key('Ann', [68, 68]), key('Bea', [74, 70]), key('Cal', [70, 74]), key('Dee', [72, 72])];

  it('coach: players level on to par and strokes share a place, in name order', () => {
    expect(rankStandings(field, (k) => k).map((p) => [p.item.name, p.position, p.tied])).toEqual([
      ['Ann', 1, false],
      ['Bea', 2, true],
      ['Cal', 2, true],
      ['Dee', 2, true],
    ]);
  });

  it('90180 last_round: the same field is separated by the last round, then the one before', () => {
    expect(rankStandings(field, (k) => k, 'last_round').map((p) => [p.item.name, p.position, p.tied])).toEqual([
      ['Ann', 1, false],
      ['Bea', 2, false],
      ['Dee', 3, false],
      ['Cal', 4, false],
    ]);
  });

  it('a short card stays below every full card whatever its last round', () => {
    const withShort = [key('Ann', [72, 72]), key('Eve', [60, null])];
    expect(rankStandings(withShort, (k) => k, 'last_round').map((p) => [p.item.name, p.short])).toEqual([
      ['Ann', false],
      ['Eve', true],
    ]);
  });

  it('to par and strokes still come first', () => {
    expect(compareStandings(key('A', [70, 73]), key('B', [72, 72]), 'last_round')).toBeLessThan(0);
    expect(compareStandings(key('A', [74, 70]), key('B', [70, 72]), 'last_round')).toBeGreaterThan(0);
  });
});

describe('the selection workspace ranks with the same rule (F-04)', () => {
  it('rankCandidates places what the board places, so confirm writes the squad the board shows', async () => {
    const { rankCandidates } = await import('../loader');
    const c = (first: string, rounds: number[]) => ({
      player_id: first,
      player_first_name: first,
      player_last_name: 'X',
      rounds_completed: rounds.length,
      total_score: rounds.reduce((s, r) => s + r, 0),
      total_to_par: rounds.reduce((s, r) => s + r - 72, 0),
      rounds_by_slot: rounds,
    });
    const field = [c('Cal', [70, 74]), c('Bea', [74, 70])];
    expect(rankCandidates(field).map((r) => [r.player_id, r.leaderboard_position, r.leaderboard_tied])).toEqual([
      ['Bea', 1, true],
      ['Cal', 1, true],
    ]);
    expect(rankCandidates(field, 'last_round').map((r) => [r.player_id, r.leaderboard_position, r.leaderboard_tied])).toEqual([
      ['Bea', 1, false],
      ['Cal', 2, false],
    ]);
  });
});
