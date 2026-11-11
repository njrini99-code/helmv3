/**
 * One number, one source. `src/lib` may not import `src/clubhouse`, so the fact sheet states the Stats screens' rules
 * from the same lib pieces. This test runs the fact sheet and the Clubhouse functions over the SAME rows and fails if
 * a figure, a window or a floor parts from what a screen prints. (A test file may import `src/clubhouse`.)
 */
import { describe, expect, it } from 'vitest';
import { FLOORS, OWN_SD_MIN_ROUNDS } from '@/clubhouse/lib/stats-signal';
import { lastTenRounds, roundsForFigures } from '@/clubhouse/data/figure-window';
import { holeRounds as chHoleRounds } from '@/clubhouse/data/round-scope';
import { LAST_TEN_MONTHS, MIN_SG_ROUNDS, countsForScoring, lastTenFloor, seasonStartDate, type ChRound } from '@/clubhouse/data/season';
import { cachedPutts, previousInFilter, rate, rateSample, roundsInFilter, tourForGender, withoutEmptyHoleCounts, type ChRoundCache } from '@/clubhouse/data/stats-common';
import { OPENING_MIN_ROUNDS as CH_OPENING_MIN, PRESSURE_MIN as CH_PRESSURE_MIN, openingDelta, pressureGap } from '@/clubhouse/data/stats-figures';
import { filterFor } from '@/clubhouse/data/stats-filter';
import { bigNumberRate, sgOver, summarizeWindow, weightedMean } from '@/clubhouse/data/stats-weight';
import { LEAK_BUCKET_MIN_N, aggregateApproachBuckets, aggregatePuttBuckets } from '@/lib/golf/leak-map-buckets';
import { tourFor } from '@/lib/golf/benchmarks/tour';
import { assembleFactSheets } from '../fact-sheet';
import { APPROACH_BAND_MIN_SHOTS, FRACTION_MIN_ROUNDS, OPENING_MIN_ROUNDS, PRESSURE_MIN, PUTT_BAND_MIN_PUTTS, SAVE_MIN_CHANCES, STROKES_GAINED_MIN_ROUNDS, cacheForFigures } from '../measures';
import { MIN_ROUNDS_PER_WINDOW } from '../notability';
import { MIN_PREVIOUS_ROUNDS, READ_BACK_MONTHS, countedRounds, readSince } from '../rounds';
import { WINDOW_ROUNDS, type FactSheet } from '../types';
import { NOW, TeamFixture, daysAgo, normal, seeded, type RoundSpec } from './fixtures';

/** Twenty-six rounds of mixed golf: practice in between, a round with no type, a total-only round, varied counts. */
function mixedRounds(): RoundSpec[] {
  const rng = seeded(7);
  const made = (p: number) => rng() < p;
  const count = (n: number, p: number) => Array.from({ length: n }, () => made(p)).filter(Boolean).length;
  return Array.from({ length: 26 }, (_, i): RoundSpec => {
    const greens = count(18, 0.55);
    return {
      date: daysAgo(1 + i * 6),
      type: i % 5 === 2 ? 'practice' : i % 7 === 3 ? null : i % 3 === 0 ? 'qualifying' : 'tournament',
      score: 70 + Math.round(Math.abs(4 * normal(rng))),
      holeOne: i % 4 === 0 ? 1 : 0,
      totalOnly: i === 4,
      shots: i % 6 !== 5,
      sg: i === 9 ? null : { tee: normal(rng), approach: -1 + 2 * normal(rng), around: normal(rng), putting: 1.5 * normal(rng) },
      putts: [[4, made(0.8)], [4, made(0.8)], [5, made(0.7)], [8, made(0.45)], [10, made(0.4)], [12, made(0.25)], [22, made(0.1)], [40, made(0.03)]] as const,
      approaches: [[100, 25, made(0.7)], [125, 30, made(0.6)], [150, 45, made(0.5)], [174, 50, made(0.5)], [190, 70, made(0.3)], [210, 80, made(0.3)]] as const,
      cache: {
        greens_hit: greens,
        fairways_hit: count(14, 0.5),
        total_putts: i === 12 ? 0 : 27 + count(8, 0.5),
        three_putts: count(3, 0.3),
        penalty_strokes: count(2, 0.4),
        scramble_attempts: 18 - greens,
        scrambles_converted: count(18 - greens, 0.4),
        sand_attempts: count(3, 0.5),
        sand_saves: count(1, 0.5),
      },
    };
  });
}

const fx = new TeamFixture().player('p1', mixedRounds());
const sheet: FactSheet = assembleFactSheets(fx.rows())[0]!;
const fig = (id: string, window: 'current' | 'previous' | 'season' = 'current') => sheet.measures.find((m) => m.id === id)![window]!;

/** The loaded rounds as the Clubhouse loader would hand them on (`loadSeasonRounds`, after its countable step). */
const chRounds: ChRound[] = countedRounds(fx.rounds).map(({ total_only, ...r }) => ({
  ...r,
  course_name: null,
  tees_played: null,
  total_gir: null,
  total_gir_possible: null,
  total_fairways_hit: null,
  total_fairways: null,
  ...(total_only ? { total_only: true as const } : {}),
}));
const seasonStart = seasonStartDate(NOW, 'America/New_York');
const counted = chRounds.filter(countsForScoring);
const f = filterFor('last10');
const last = roundsInFilter(counted, f, seasonStart);
const previous = previousInFilter(counted, f, seasonStart)!;
const cacheOf = (rounds: ChRound[]): ChRoundCache[] =>
  chHoleRounds(rounds).flatMap((r) => {
    const c = fx.cache.find((x) => x.round_id === r.id);
    return c ? [withoutEmptyHoleCounts(c)] : [];
  });

describe('the windows are the Stats screens\' windows', () => {
  it('last 10: the same rounds in the same order', () => {
    expect(sheet.windows.last10.round_ids).toEqual(last.map((r) => r.id));
    expect(sheet.windows.last10.round_ids).toEqual(lastTenRounds(chRounds).map((r) => r.id));
    expect(sheet.windows.last10.rounds).toBe(WINDOW_ROUNDS);
  });

  it('previous 10: the ten before them', () => {
    expect(sheet.windows.previous10!.round_ids).toEqual(previous.map((r) => r.id));
  });

  it('this season: from 1 August on the team\'s calendar, practice left out', () => {
    const season = roundsInFilter(counted, filterFor('season'), seasonStart);
    expect(sheet.windows.season.round_ids).toEqual(season.map((r) => r.id));
    expect(sheet.season_start).toBe(seasonStart);
    expect(sheet.windows.season.round_ids).toEqual(roundsForFigures(chRounds).filter((r) => r.round_date >= seasonStart).map((r) => r.id));
  });

  it('reads as far back as the screens do', () => {
    expect(READ_BACK_MONTHS).toBe(LAST_TEN_MONTHS);
    // The Clubhouse helper reads the clock; this one is given the moment. On the same day they agree.
    const today = new Date();
    expect(readSince(today)).toBe(lastTenFloor(today));
    expect(MIN_PREVIOUS_ROUNDS).toBe(3);
  });
});

describe('the figures are the Stats screens\' figures', () => {
  it('scoring average', () => {
    expect(fig('scoring_average').value).toBeCloseTo(summarizeWindow(last).avg!, 4);
    expect(fig('scoring_average', 'previous').value).toBeCloseTo(summarizeWindow(previous).avg!, 4);
  });

  it('strokes gained as the screen prints it (measured and estimated rounds together)', () => {
    const screen = sgOver(chHoleRounds(last));
    const total = sheet.measures.find((m) => m.id === 'strokes_gained_total')!.screen!;
    expect(total.value).toBeCloseTo(screen.total!, 4);
    expect(total.rounds).toBe(screen.effective);
    expect(total.blended).toBe(true);
    expect(sheet.measures.find((m) => m.id === 'strokes_gained_approach')!.screen!.value).toBeCloseTo(screen.legs.approach!, 4);
    expect(sheet.measures.find((m) => m.id === 'strokes_gained_putting')!.screen!.value).toBeCloseTo(screen.legs.putting!, 4);
  });

  it('measured and estimated strokes gained add back up to the screen\'s figure', () => {
    const m = fig('strokes_gained_total');
    const e = fig('strokes_gained_total_estimated');
    const screen = sheet.measures.find((x) => x.id === 'strokes_gained_total')!.screen!;
    // Where either part is under its floor of three rounds, it has no value and nothing is checked.
    if (m.value != null && e.value != null) {
      expect((m.value * m.sample.rounds + e.value * e.sample.rounds) / (m.sample.rounds + e.sample.rounds)).toBeCloseTo(screen.value!, 3);
    }
    expect(m.sample.rounds + e.sample.rounds).toBe(screen.rounds);
  });

  it('greens, fairways, scrambling and sand saves, pooled from the round cache', () => {
    for (const [id, made, total] of [
      ['greens_in_regulation', 'greens_hit', 'greens_total'],
      ['fairways_hit', 'fairways_hit', 'fairways_total'],
      ['scrambling', 'scrambles_converted', 'scramble_attempts'],
      ['sand_saves', 'sand_saves', 'sand_attempts'],
    ] as const) {
      for (const [window, rounds] of [['current', last], ['previous', previous]] as const) {
        const rows = cacheOf(rounds);
        const mine = fig(id, window);
        const theirs = rate(rows, made, total);
        const chances = rateSample(rows, total, 'chance');
        const shown = id === 'scrambling' || id === 'sand_saves' ? chances >= FLOORS.scramble.show : rateSample(rows, total, 'round') >= FLOORS.fraction.show;
        if (shown) expect(mine.value, `${id} ${window}`).toBeCloseTo(theirs!, 4);
        else expect(mine.value, `${id} ${window}`).toBeNull();
        expect(mine.sample.attempts).toBe(chances);
      }
    }
  });

  it('putts and three-putts per round, over the rounds with putts recorded', () => {
    const byId = new Map(cacheOf(last).map((c) => [c.round_id, c]));
    const holes = chHoleRounds(last);
    expect(fig('putts_per_round').value).toBeCloseTo(weightedMean(holes, (r) => cachedPutts(byId.get(r.id), 'total_putts'))!, 4);
    expect(fig('three_putts_per_round').value).toBeCloseTo(weightedMean(holes, (r) => cachedPutts(byId.get(r.id), 'three_putts'))!, 4);
    expect(fig('penalty_strokes_per_round').value).toBeCloseTo(weightedMean(holes, (r) => byId.get(r.id)?.penalty_strokes ?? null)!, 4);
  });

  it('big numbers', () => {
    const byId = new Map(cacheOf(last).map((c) => [c.round_id, c]));
    const theirs = bigNumberRate(chHoleRounds(last).flatMap((r) => (byId.get(r.id) ? [{ holes_played: r.holes_played, doubles: byId.get(r.id)!.double_bogeys, triples: byId.get(r.id)!.triple_plus }] : [])));
    expect(fig('big_numbers').value).toBeCloseTo(theirs!, 4);
  });

  it('the opening hole', () => {
    const ids = new Set(chHoleRounds(last).map((r) => r.id));
    const theirs = openingDelta(fx.holes.filter((h) => ids.has(h.round_id)).map((h) => ({ round_id: h.round_id, hole_number: h.hole_number, par: h.par!, score: h.score! })));
    expect(fig('opening_hole').value).toBeCloseTo(theirs.delta!, 4);
    expect(fig('opening_hole').sample.rounds).toBe(theirs.rounds);
  });

  it('the pressure gap, read from the window with practice kept', () => {
    // Stats: `pressureGap(roundsInFilter(allMine, f, start))`, the newest ten rounds of every type.
    const theirs = pressureGap(roundsInFilter(chRounds, f, seasonStart));
    const mine = fig('pressure_gap');
    expect(mine.window.rounds).toBe(10);
    if (theirs.gap == null) expect(mine.value).toBeNull();
    else expect(mine.value).toBeCloseTo(theirs.gap, 4);
    expect(mine.sample.attempts).toBe(theirs.pressureRounds + theirs.practiceRounds);
  });

  it('make rate by distance, on the one definition the leak map uses', () => {
    const ids = new Set(chHoleRounds(last).map((r) => r.id));
    const putts = fx.shots.filter((s) => ids.has(s.round_id) && s.shot_type === 'putting');
    const buckets = aggregatePuttBuckets(putts, new Map());
    for (const band of ['3_5', '5_10', '10_15', '15_25', '25_plus']) {
      const theirs = buckets.find((b) => b.bucket_id === band)!;
      const mine = fig(`putts_made_${band}`);
      expect(mine.sample.attempts, band).toBe(theirs.sample_n);
      if (theirs.team_value == null) expect(mine.value, band).toBeNull();
      else expect(mine.value, band).toBeCloseTo(theirs.team_value, 1);
    }
  });

  it('approach proximity and green hits, from the leak map\'s aggregator', () => {
    const ids = new Set(chHoleRounds(last).map((r) => r.id));
    const par = new Map(fx.holes.map((h) => [h.id, h.par]));
    const rows = fx.shots
      .filter((s) => ids.has(s.round_id) && s.shot_type === 'approach')
      .map((s) => ({ ...s, par: s.hole_id ? (par.get(s.hole_id) ?? null) : null }));
    for (const b of aggregateApproachBuckets(rows, new Map())) {
      expect(fig(`approach_proximity_${b.bucket_id}`).value, b.bucket_id).toBe(b.team_value);
      expect(fig(`approach_proximity_${b.bucket_id}`).sample.attempts).toBe(b.sample_n);
      if (b.sample_n >= LEAK_BUCKET_MIN_N) expect(fig(`approach_green_hit_${b.bucket_id}`).value).toBeCloseTo(b.green_hit_pct!, 1);
    }
  });
});

describe('the floors are the Stats screens\' floors', () => {
  it('match the constants the screens use', () => {
    expect(STROKES_GAINED_MIN_ROUNDS).toBe(MIN_SG_ROUNDS);
    expect(FRACTION_MIN_ROUNDS).toBe(FLOORS.fraction.show);
    expect(SAVE_MIN_CHANCES).toBe(FLOORS.scramble.show);
    expect(PUTT_BAND_MIN_PUTTS).toBe(FLOORS.make.show);
    expect(APPROACH_BAND_MIN_SHOTS).toBe(LEAK_BUCKET_MIN_N);
    expect(PRESSURE_MIN).toEqual({ competitive: CH_PRESSURE_MIN.pressure, practice: CH_PRESSURE_MIN.practice, total: CH_PRESSURE_MIN.total });
    expect(OPENING_MIN_ROUNDS).toBe(CH_OPENING_MIN);
    // Notability's five-round rule is the screens' "own spread from five rounds".
    expect(MIN_ROUNDS_PER_WINDOW).toBe(OWN_SD_MIN_ROUNDS);
  });

  it('treats a cache row for a round with no hole scored as the screens do', () => {
    const empty: ChRoundCache = { round_id: 'r', greens_hit: 9, greens_total: 18, fairways_hit: 7, fairways_total: 14, total_putts: 30, scramble_attempts: 0, scrambles_converted: 0, birdies: 0, eagles: 0, sand_attempts: 0, sand_saves: 0, three_putts: 0, penalty_strokes: 0, double_bogeys: 0, triple_plus: 0, pars: 0, bogeys: 0 };
    const scored: ChRoundCache = { ...empty, pars: 12, bogeys: 6 };
    const partial: ChRoundCache = { ...empty, pars: null };
    for (const row of [empty, scored, partial]) {
      expect(cacheForFigures({ ...row, pars: row.pars ?? null, bogeys: row.bogeys ?? null })).toEqual(withoutEmptyHoleCounts(row));
    }
  });

  it('picks the tour the screens pick for the stored team genders', () => {
    // `golf_teams.gender` holds 'mens' or 'womens'. Clubhouse also reads 'women' and 'female' as the LPGA; lib's tourFor does not.
    for (const gender of ['mens', 'womens', null, undefined, 'coed']) expect(tourFor(gender)).toBe(tourForGender(gender));
  });
});
