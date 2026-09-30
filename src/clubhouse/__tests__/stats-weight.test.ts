import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { summarizePlayer, type ChRound } from '../data/season';
import { bigNumberRate, effectiveCount, effectiveRounds, per18, perEighteen, roundsWord, roundWeight, summarizeWindow, weightedMean } from '../data/stats-weight';

/** Nine and eighteen holes on one page: every per-round figure per 18, a nine-hole round half a round (PARITY.md, "The round filter"). */

const r = (id: string, holes: number, score: number, over: Partial<ChRound> = {}): ChRound =>
  ({
    id,
    player_id: 'p',
    course_name: 'Finley GC',
    tees_played: null,
    round_date: '2026-09-01',
    round_type: 'practice',
    total_score: score,
    score_to_par: score - (holes === 9 ? 36 : 72),
    front_nine: null,
    back_nine: null,
    holes_played: holes,
    total_putts: null,
    total_gir: null,
    total_gir_possible: null,
    total_fairways_hit: null,
    total_fairways: null,
    strokes_gained_total: null,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
    ...over,
  }) as ChRound;

describe('weights', () => {
  it('a nine-hole round is half a round, an unrecorded length is eighteen', () => {
    expect(roundWeight({ holes_played: 9 })).toBe(0.5);
    expect(roundWeight({ holes_played: 18 })).toBe(1);
    expect(roundWeight({ holes_played: null })).toBe(1);
    expect(effectiveRounds([{ holes_played: 9 }, { holes_played: 9 }, { holes_played: 18 }])).toBe(2);
    expect(per18(38, 9)).toBe(76);
    expect(per18(72, 18)).toBe(72);
    expect(per18(72, null)).toBe(72);
  });

  it('the per-18 mean is the sum over the rounds that have the figure, over their weights', () => {
    // 75 over one round and 38 over half a round: 113 over a round and a half.
    expect(weightedMean([r('a', 18, 75), r('b', 9, 38)], (x) => x.total_score)).toBeCloseTo(113 / 1.5, 10);
    // Nine holes alone: a 38 is 76 a round.
    expect(weightedMean([r('b', 9, 38), r('c', 9, 40)], (x) => x.total_score)).toBe(78);
    // With eighteen-hole rounds only it is the plain mean.
    expect(weightedMean([r('a', 18, 72), r('b', 18, 74)], (x) => x.total_score)).toBe(73);
    // A round with no value for the figure takes no part, neither in the sum nor in the weight.
    expect(weightedMean([r('a', 18, 72), r('b', 9, 38, { total_putts: 15 })], (x) => x.total_putts)).toBe(30);
    expect(weightedMean([r('a', 18, 72)], (x) => x.total_putts)).toBeNull();
    expect(effectiveCount([r('a', 18, 72), r('b', 9, 38, { total_putts: 15 })], (x) => x.total_putts)).toBe(0.5);
  });

  it('big numbers are doubles and worse over the holes played, whatever the rounds\' lengths', () => {
    expect(bigNumberRate([{ holes_played: 18, doubles: 2, triples: 1 }, { holes_played: 9, doubles: 0, triples: 1 }])).toBeCloseTo((4 / 27) * 100, 10);
    expect(bigNumberRate([{ holes_played: 18, doubles: null, triples: 1 }])).toBeNull();
    expect(bigNumberRate([])).toBeNull();
  });

  it('counts in words: whole rounds, or a half', () => {
    expect(roundsWord(3)).toBe('3');
    expect(roundsWord(2.5)).toBe('2.5');
  });
});

describe('a window of nine- and eighteen-hole rounds', () => {
  it('is the same as the season summary when every round is eighteen holes', () => {
    const rounds = [r('a', 18, 71, { strokes_gained_total: 1, strokes_gained_putting: 0.5 }), r('b', 18, 74, { strokes_gained_total: -1 }), r('c', 18, 75, { strokes_gained_total: 0.5 }), r('d', 18, 70)];
    const w = summarizeWindow(rounds);
    const s = summarizePlayer(rounds);
    expect(w).toMatchObject({ rounds: s.rounds, avg: s.avg, toPar: s.toPar, trend: s.trend, formChange: s.formChange, sgPerRound: s.sgPerRound, sgRounds: s.sgRounds, status: s.status, lastRoundDate: s.lastRoundDate });
    expect(w.sgLegs).toEqual(s.sgLegs);
    expect(w.effRounds).toBe(4);
  });

  it('averages per 18: nine-hole rounds alone double, together they weigh half', () => {
    expect(summarizeWindow([r('a', 9, 38), r('b', 9, 40)]).avg).toBe(78);
    const mixed = summarizeWindow([r('a', 18, 75), r('b', 9, 38)]);
    expect(mixed.avg).toBeCloseTo(113 / 1.5, 10);
    expect(mixed.toPar).toBeCloseTo((3 + 2) / 1.5, 10);
    expect(mixed.rounds).toBe(2);
    expect(mixed.effRounds).toBe(1.5);
    // The trend and its form read per 18 too: 75, then 38 doubled.
    expect(mixed.trend).toEqual([76, 75]);
  });

  it('strokes gained per round is per 18 and needs three whole rounds: two nine-hole rounds are one', () => {
    // Four nine-hole rounds are two whole rounds: under the floor, even though there are four of them.
    const four = [1, 2, 3, 4].map((i) => r(`n${i}`, 9, 38, { strokes_gained_total: 0.5 }));
    const under = summarizeWindow(four);
    expect(under.sgRounds).toBe(4);
    expect(under.effSgRounds).toBe(2);
    expect(under.sgPerRound).toBeNull();
    // Six make three: +0.5 over half a round is +1.0 a round.
    const six = [...four, r('n5', 9, 38, { strokes_gained_total: 0.5 }), r('n6', 9, 38, { strokes_gained_total: 0.5 })];
    expect(summarizeWindow(six).sgPerRound).toBe(1);
    // One eighteen-hole round at +2 and two nine-hole rounds at +1 each: 4 over two whole rounds is 2... with a third round it reaches the floor.
    const mix = [r('a', 18, 72, { strokes_gained_total: 2 }), r('b', 18, 72, { strokes_gained_total: 1 }), r('c', 9, 38, { strokes_gained_total: 0.5 }), r('d', 9, 38, { strokes_gained_total: 0.5 })];
    const m = summarizeWindow(mix);
    expect(m.effSgRounds).toBe(3);
    expect(m.sgPerRound).toBeCloseTo(4 / 3, 10);
  });

  it('a leg needs its own three whole rounds', () => {
    const rounds = [r('a', 18, 72, { strokes_gained_putting: 1 }), r('b', 9, 38, { strokes_gained_putting: 1 }), r('c', 9, 38, { strokes_gained_putting: 1 })];
    expect(summarizeWindow(rounds).sgLegs.putting).toBeNull();
    expect(summarizeWindow([...rounds, r('d', 18, 72, { strokes_gained_putting: 2 })]).sgLegs.putting).toBeCloseTo(5 / 3, 10);
  });
});

describe('the calculator\'s per-round counts', () => {
  const stats = (over: Record<string, unknown> = {}) =>
    ({ holesPlayed: 27, totalEagles: 0, totalBirdies: 3, totalPars: 15, totalBogeys: 6, totalDoublePlus: 3, eaglesPerRound: 0, birdiesPerRound: 1.5, parsPerRound: 7.5, bogeysPerRound: 3, doublePlusPerRound: 1.5, scoringAverage: 75, scoringAverage18: 75, ...over }) as never;

  it('are restated per 18 from the totals when a nine-hole round is in the window', () => {
    const out = perEighteen(stats(), [r('a', 18, 75), r('b', 9, 38)]);
    // 3 birdies in 27 holes is 2 an 18.
    expect(out.birdiesPerRound).toBe(2);
    expect(out.parsPerRound).toBe(10);
    expect(out.bogeysPerRound).toBe(4);
    expect(out.doublePlusPerRound).toBe(2);
    expect(out.scoringAverage18).toBeCloseTo(113 / 1.5, 10);
    expect(out.scoringAverage).toBeCloseTo(113 / 1.5, 10);
  });

  it('restate the average to par, the fairways a round and the scoring by round type, each over whole rounds', () => {
    // A long and a short round of every type but one: per 18 a type's average counts a 38 as a 76, its round count is the rows.
    const rounds = [
      r('p1', 18, 76, { round_type: 'practice' }),
      r('p2', 9, 38, { round_type: 'practice' }),
      r('q1', 9, 40, { round_type: 'qualifying' }),
      r('t1', 18, 70, { round_type: 'tournament' }),
      r('n1', 18, 99, { round_type: null }),
    ];
    const out = perEighteen(stats({ holesPlayed: 72, fairwaysHit: 36, practiceScoringAvg: 1, practiceRounds: 1, avgScoreToPar: 1 }), rounds);
    // 76 and 76 (a 38 doubled) over two whole rounds; the qualifier is a 40, which is 80; a round with no type is in none of them.
    expect(out.practiceScoringAvg).toBe(76);
    expect(out.practiceRounds).toBe(2);
    expect(out.qualifyingScoringAvg).toBe(80);
    expect(out.qualifyingRounds).toBe(1);
    expect(out.tournamentScoringAvg).toBe(70);
    expect(out.tournamentRounds).toBe(1);
    // To par, over the rounds' weights (1 + 0.5 + 0.5 + 1 + 1): +4, +2 and +4 over nine holes, -2, and +27.
    expect(out.avgScoreToPar).toBeCloseTo((4 + 2 + 4 - 2 + 27) / 4, 10);
    // 36 fairways in 72 holes is 9 an 18.
    expect(out.fairwaysHitPerRound).toBe(9);
    const none = perEighteen(stats({ holesPlayed: 72 }), [r('p1', 9, 38, { round_type: 'practice' })]);
    expect(none.qualifyingScoringAvg).toBeNull();
    expect(none.qualifyingRounds).toBe(0);
    expect(none.practiceScoringAvg).toBe(76);
  });

  it('are the calculator\'s own with eighteen-hole rounds only, and with no holes', () => {
    const s = stats();
    expect(perEighteen(s, [r('a', 18, 75), r('b', 18, 76)])).toBe(s);
    const none = stats({ holesPlayed: 0 });
    expect(perEighteen(none, [r('a', 9, 38)])).toBe(none);
  });
});
