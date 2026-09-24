import { describe, expect, it } from 'vitest';
import {
  MAX_ABS_SG_TOTAL_PER_ROUND,
  MAX_SG_TOTAL_PER_ROUND,
  MIN_PLAUSIBLE_STROKES_PER_18,
  filterCountableRounds,
  isCountableRound,
  minPlausibleStrokes,
  roundExclusionReason,
  type CountableRoundInput,
} from './round-countable';
import { aggregateCountableRounds, type RoundStatsCacheRow } from './countable-round-stats';

const full18 = (total: number, putts = 32): CountableRoundInput => ({
  status: 'completed',
  holes_played: 18,
  total_score: total,
  front_nine: Math.floor(total / 2),
  back_nine: total - Math.floor(total / 2),
  total_putts: putts,
});

/** Shape of prod round 91301a75 (Sep 17 2026): 18 scored holes, 37 strokes, 18 putts, SG +34.51. */
const SEP_17_FIXTURE: CountableRoundInput = {
  status: 'completed',
  holes_played: 18,
  total_score: 37,
  front_nine: 19,
  back_nine: 18,
  total_putts: 18,
  recorded_holes: 18,
  strokes_gained_total: 34.51,
};

describe('round-countable', () => {
  it('exports the thresholds', () => {
    expect(MIN_PLAUSIBLE_STROKES_PER_18).toBe(50);
    expect(MAX_SG_TOTAL_PER_ROUND).toBe(15);
    expect(MAX_ABS_SG_TOTAL_PER_ROUND).toBe(MAX_SG_TOTAL_PER_ROUND);
  });

  it('excludes the Sep 17 round (37 strokes over 18 holes)', () => {
    expect(isCountableRound(SEP_17_FIXTURE)).toBe(false);
    expect(roundExclusionReason(SEP_17_FIXTURE)).toBe('implausible_score');
  });

  it('excludes the Sep 17 shape on the stroke floor alone, without SG', () => {
    const { strokes_gained_total: _sg, ...noSg } = SEP_17_FIXTURE;
    expect(roundExclusionReason(noSg)).toBe('implausible_score');
  });

  it('counts a normal completed 18-hole round', () => {
    expect(isCountableRound(full18(74))).toBe(true);
    expect(isCountableRound({ ...full18(68), strokes_gained_total: 4.2 })).toBe(true);
  });

  it('excludes a round that is not completed', () => {
    expect(roundExclusionReason({ ...full18(74), status: 'in_progress' })).toBe('not_completed');
  });

  it('treats a missing status as already filtered by the query', () => {
    const { status: _s, ...noStatus } = full18(74);
    expect(isCountableRound(noStatus)).toBe(true);
  });

  it('excludes a hole-less round (declared 18, no nine totals)', () => {
    expect(
      roundExclusionReason({
        status: 'completed',
        holes_played: 18,
        total_score: 73,
        front_nine: null,
        back_nine: null,
        total_putts: null,
      }),
    ).toBe('holes_missing');
  });

  it('prefers an explicit recorded_holes count', () => {
    expect(roundExclusionReason({ ...full18(74), recorded_holes: 12 })).toBe('holes_missing');
  });

  it('counts 9-hole rounds on either nine and applies a scaled floor', () => {
    const front = { status: 'completed', holes_played: 9, total_score: 38, front_nine: 38, back_nine: null, total_putts: 16 };
    const back = { ...front, front_nine: null, back_nine: 38 };
    expect(isCountableRound(front)).toBe(true);
    expect(isCountableRound(back)).toBe(true);
    expect(minPlausibleStrokes(9, null)).toBe(25);
    expect(roundExclusionReason({ ...front, total_score: 24, front_nine: 24, total_putts: 9 })).toBe('implausible_score');
    // A 9-hole row claiming both nines is not a 9-hole round.
    expect(roundExclusionReason({ ...front, back_nine: 40 })).toBe('holes_missing');
  });

  it('rejects unsupported lengths', () => {
    expect(roundExclusionReason({ ...full18(60), holes_played: 12 })).toBe('unsupported_length');
  });

  it('applies the putts-aware floor (every hole needs a non-putt stroke)', () => {
    expect(minPlausibleStrokes(18, 36)).toBe(54);
    expect(roundExclusionReason(full18(53, 36))).toBe('implausible_score');
    expect(isCountableRound(full18(54, 36))).toBe(true);
  });

  it('rejects an SG total above +15 when supplied', () => {
    expect(roundExclusionReason({ ...full18(70), strokes_gained_total: 15.5 })).toBe('implausible_sg');
    expect(isCountableRound({ ...full18(70), strokes_gained_total: 15 })).toBe(true);
  });

  // Requirement change (W13, 2026-09-24): the ceiling is one-sided. A real bad
  // round has a large negative SG (SG tracks −strokes over the baseline). The
  // old ±15 rule dropped 15 real prod rounds, e.g. 56ffffd4: 88 strokes, +17,
  // SG −18.77, and 2f343331: 95 strokes, +23, SG −24.11.
  it('counts a real high-scoring round with a large negative SG', () => {
    expect(isCountableRound({ ...full18(88, 34), strokes_gained_total: -18.77 })).toBe(true);
    expect(isCountableRound({ ...full18(95, 40), strokes_gained_total: -24.11 })).toBe(true);
    expect(isCountableRound({ ...full18(90), strokes_gained_total: -16 })).toBe(true);
  });

  it('filterCountableRounds keeps order', () => {
    const rows = [full18(70), SEP_17_FIXTURE, full18(80)];
    expect(filterCountableRounds(rows).map((r) => r.total_score)).toEqual([70, 80]);
  });
});

describe('aggregateCountableRounds', () => {
  const stats = (id: string, over: Partial<RoundStatsCacheRow> = {}): RoundStatsCacheRow => ({
    round_id: id,
    birdies: 2,
    eagles: 0,
    total_putts: 32,
    three_putts: 1,
    fairways_hit: 7,
    fairways_total: 14,
    greens_hit: 9,
    greens_total: 18,
    scramble_attempts: 9,
    scrambles_converted: 3,
    strokes_gained_total: -1,
    strokes_gained_tee: 0.5,
    strokes_gained_approach: -0.5,
    strokes_gained_around_green: 0,
    strokes_gained_putting: -1,
    ...over,
  });

  it('leaves the bad round and hole-less rounds out of every headline number', () => {
    const rounds = [
      { id: 'sep17', round_date: '2026-09-17', ...SEP_17_FIXTURE },
      { id: 'holeless', round_date: '2026-08-31', status: 'completed', holes_played: 18, total_score: 73, front_nine: null, back_nine: null, total_putts: null },
      { id: 'a', round_date: '2026-08-02', ...full18(70, 38) },
      { id: 'b', round_date: '2026-07-10', ...full18(84, 34) },
      { id: 'nine', round_date: '2026-05-18', status: 'completed', holes_played: 9, total_score: 38, front_nine: 38, back_nine: null, total_putts: 16 },
    ];
    const map = new Map([
      ['sep17', stats('sep17', { strokes_gained_total: 34.51, total_putts: 18, birdies: 17 })],
      ['a', stats('a', { total_putts: 38, birdies: 4, strokes_gained_total: 1 })],
      ['b', stats('b', { total_putts: 34, birdies: 1, strokes_gained_total: -3 })],
      ['nine', stats('nine', { total_putts: 16, birdies: 1, strokes_gained_total: null, greens_total: 9, greens_hit: 5 })],
    ]);
    const h = aggregateCountableRounds(rounds, map);
    expect(h.roundsCounted).toBe(3);
    expect(h.roundsExcluded).toBe(2);
    expect(h.bestRound).toBe(70);
    expect(h.scoringAverage).toBe(77);
    expect(h.scoringAverageRounds).toBe(2);
    // (38 + 34 + 16) putts over 45 holes, per 18.
    expect(h.puttsPer18).toBeCloseTo((88 / 45) * 18, 5);
    // Birdies per 18 HOLES, not per round: (4 + 1 + 1) over 45 holes.
    expect(h.birdiesPer18).toBeCloseTo((6 / 45) * 18, 5);
    expect(h.sg.total).toBe(-1);
    expect(h.sg.rounds).toBe(2);
  });

  it('computes a real last-5 and prior-5 from 18-hole rounds, newest first', () => {
    const totals = [70, 71, 72, 73, 74, 80, 81, 82, 83, 84];
    const rounds = totals.map((t, i) => ({ id: `r${i}`, round_date: `2026-0${9 - Math.floor(i / 2)}-01`, ...full18(t) }));
    const h = aggregateCountableRounds(rounds);
    expect(h.last5Average).toBe(72);
    expect(h.prior5Average).toBe(82);
    expect(h.scoringAverage).toBe(77);
  });

  it('has no prior-5 with fewer than 10 rounds', () => {
    const rounds = [70, 71, 72].map((t, i) => ({ id: `r${i}`, round_date: '2026-09-01', ...full18(t) }));
    expect(aggregateCountableRounds(rounds).prior5Average).toBeNull();
  });
});
