/**
 * Field stats against the Fall Invitational (86dad12b) production rows:
 * 7 players, rounds 1 and 2 linked (golf_rounds), round 3 to play.
 */
import { describe, it, expect } from 'vitest';

import { deriveStandings } from '../qualifier-display';
import {
  distribution,
  fieldTotals,
  lowRound,
  movers,
  roundOverRound,
  roundSummaries,
  type LinkedRound,
} from '../qualifier-stats';

const ROUNDS: Record<string, Array<[number, number]>> = {
  'Cole Bennett': [[71, -1], [70, -2]],
  'Mason Rivers': [[72, 0], [72, 0]],
  'Owen Carter': [[74, 2], [71, -1]],
  'Ethan Park': [[73, 1], [73, 1]],
  'Jackson Hale': [[75, 3], [72, 0]],
  'Dylan Brooks': [[76, 4], [74, 2]],
  'Tyler Hayes': [[78, 6], [77, 5]],
};
const id = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

const LINKED: LinkedRound[] = Object.entries(ROUNDS).flatMap(([name, rounds]) =>
  rounds.map(([score, toPar], i) => ({ playerId: id(name), playerName: name, roundNumber: i + 1, score, toPar })),
);

const STANDINGS = deriveStandings(
  Object.entries(ROUNDS).map(([name, rounds]) => ({
    player_id: id(name),
    player_name: name,
    rounds_completed: rounds.length,
    total_score: rounds.reduce((s, [score]) => s + score, 0),
    total_to_par: rounds.reduce((s, [, toPar]) => s + toPar, 0),
  })),
);

describe('fieldTotals (feed)', () => {
  it('averages the field per round and measures the spread and the travel cut', () => {
    const totals = fieldTotals(STANDINGS, 5);
    expect(totals.players).toBe(7);
    expect(totals.cards).toBe(14);
    expect(totals.averageScore).toBeCloseTo(1028 / 14, 6);
    expect(totals.averageToPar).toBeCloseTo(20 / 14, 6);
    expect(totals.spread).toEqual({ best: -3, worst: 11, shots: 14 });
    // Jackson +3 is the last one in; Dylan +6 the first one out.
    expect(totals.travelCut).toEqual({ lastIn: 3, firstOut: 6, shots: 3 });
  });

  it('has no cut without a squad size or a player outside it, and no spread alone', () => {
    expect(fieldTotals(STANDINGS, 0).travelCut).toBeNull();
    expect(fieldTotals(STANDINGS, 7).travelCut).toBeNull();
    expect(fieldTotals(STANDINGS.slice(0, 1), 5).spread).toBeNull();
  });
});

describe('round-card stats', () => {
  it('finds the low round and who shot it', () => {
    const low = lowRound(LINKED);
    expect(low?.score).toBe(70);
    expect(low?.toPar).toBe(-2);
    expect(low?.holders.map((r) => `${r.playerName} R${r.roundNumber}`)).toEqual(['Cole Bennett R2']);
  });

  it('summarises each round, with the round still to play empty', () => {
    const [r1, r2, r3] = roundSummaries(LINKED, 3);
    expect(r1?.cards).toBe(7);
    expect(r1?.averageScore).toBeCloseTo(519 / 7, 6);
    expect(r2?.averageScore).toBeCloseTo(509 / 7, 6);
    expect(r3).toEqual({ roundNumber: 3, cards: 0, averageScore: null, averageToPar: null, toPars: [] });
  });

  it('measures the latest round against round 1 over the players who played both', () => {
    const change = roundOverRound(LINKED);
    expect(change?.to).toBe(2);
    expect(change?.players).toBe(7);
    expect(change?.delta).toBeCloseTo(-10 / 7, 6);
  });

  it('buckets the rounds to par', () => {
    expect(distribution(LINKED)).toEqual([
      { label: 'Under par', count: 3 },
      { label: 'Even', count: 3 },
      { label: '+1 to +2', count: 4 },
      { label: '+3 to +4', count: 2 },
      { label: '+5 to +7', count: 2 },
      { label: '+8 or more', count: 0 },
    ]);
    expect(distribution([{ ...LINKED[0]!, toPar: null }])).toBeNull();
  });

  it('names who moved after round 2: Owen up to 3rd, Ethan down to 4th', () => {
    const result = movers(LINKED);
    expect(result?.round).toBe(2);
    expect(
      result?.moves.map((m) => `${m.playerName} ${m.before.position}→${m.after.position} (${m.change > 0 ? '+' : ''}${m.change})`),
    ).toEqual(['Owen Carter 4→3 (+1)', 'Ethan Park 3→4 (-1)']);
    expect(result?.moves[0]?.round.score).toBe(71);
  });

  it('has no movers or round-over-round change after one round', () => {
    const r1 = LINKED.filter((r) => r.roundNumber === 1);
    expect(movers(r1)).toBeNull();
    expect(roundOverRound(r1)).toBeNull();
  });
});
