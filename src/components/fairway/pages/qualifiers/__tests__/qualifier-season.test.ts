/**
 * The coach's "season avg" line reads each entrant's OTHER countable 18-hole
 * rounds: this qualifier's rounds, 9-hole rounds, rounds without their nines
 * and implausible rounds are left out, and the canonical total (front + back)
 * wins over a stale `total_score`.
 */
import { describe, it, expect } from 'vitest';

import { seasonAveragesFromRounds, type SeasonRoundRow } from '../qualifier-season';

const QUALIFIER = '86dad12b-d9e4-4d24-9d0b-8ca455634c64';

function round(overrides: Partial<SeasonRoundRow> & Pick<SeasonRoundRow, 'id' | 'player_id'>): SeasonRoundRow {
  return {
    qualifier_id: null,
    status: 'completed',
    round_date: '2026-05-01',
    holes_played: 18,
    front_nine: 36,
    back_nine: 38,
    total_score: 74,
    total_putts: 31,
    strokes_gained_total: null,
    ...overrides,
  };
}

describe('seasonAveragesFromRounds', () => {
  it("averages a player's other countable 18-hole rounds, canonical totals first", () => {
    const rows = [
      // Counts: nines 36 + 38 = 74, over a stale total_score of 75.
      round({ id: 'a1', player_id: 'cole', total_score: 75 }),
      // Counts: 72.
      round({ id: 'a2', player_id: 'cole', round_date: '2026-06-01', front_nine: 35, back_nine: 37, total_score: 72 }),
      // Countable, but a 9-hole round is not an 18-hole average.
      round({ id: 'a3', player_id: 'cole', holes_played: 9, front_nine: 40, back_nine: null, total_score: 40, total_putts: 15 }),
      // This qualifier's own round.
      round({ id: 'a4', player_id: 'cole', qualifier_id: QUALIFIER, front_nine: 35, back_nine: 35, total_score: 70 }),
      // Scores keyed without the nines (holes missing).
      round({ id: 'a5', player_id: 'cole', front_nine: null, back_nine: null, total_score: 71 }),
      // An implausible SG: Total.
      round({ id: 'a6', player_id: 'cole', front_nine: 34, back_nine: 34, total_score: 68, strokes_gained_total: 20 }),
      // Another qualifier's round is an ordinary season round.
      round({ id: 'a7', player_id: 'cole', qualifier_id: 'other', front_nine: 37, back_nine: 39, total_score: 76 }),
    ];

    expect(seasonAveragesFromRounds(rows, QUALIFIER)).toEqual({ cole: { average: 74, rounds: 3 } });
  });

  it('leaves out a player with only this qualifier or only 9-hole rounds', () => {
    const rows = [
      round({ id: 'b1', player_id: 'mason', qualifier_id: QUALIFIER }),
      round({ id: 'c1', player_id: 'owen', holes_played: 9, front_nine: 38, back_nine: null, total_score: 38, total_putts: 16 }),
    ];
    expect(seasonAveragesFromRounds(rows, QUALIFIER)).toEqual({});
  });
});
