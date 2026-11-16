/**
 * Golden test rounds G1 to G4 (stats and charts audit, 2026-11-15, section 3 "Golden test rounds"). Hand-computed figures that every
 * stats path must produce: the shot tracker's per-hole stats (`calculateHoleStats`), the shot calculator (`calculateStatsFromShots`),
 * Clubhouse's window figures (`loadSeasonRounds` + `playerFiguresOver` + `perEighteen`) and the SQL paths (the pgTAP twin is
 * supabase/tests/rls/stats_golden_rounds.sql). Shared: any test that checks a stat against these rounds imports them from here and
 * asserts `G1_EXPECTED` / `WINDOW_EXPECTED`, so there is one copy of the numbers.
 *
 * G1  18 holes, par 72, shot by shot (penalties, a chip-in, four greenside bunkers, one of them a bogey out in two).
 * G2  9 holes (front), hole by hole, no shots.
 * G3  18 holes posted as a total only (76): no nines, no holes.
 * G4  a test round (`is_test = true`), 18 holes, 37, strokes gained +34.51: never counted anywhere.
 *
 * Pure data: no Supabase, no React, no mocks. Distances are yards off the green and feet on it, as the tracker saves them.
 */
import type { ShotRecord } from '@/lib/types/golf';
import type { HoleInfo, RawShot, RoundInfo } from '@/lib/utils/golf-stats-calculator-shots';

export const GOLDEN_PLAYER_ID = 'golden-player';
export const GOLDEN_SEASON_START = '2026-08-01';

export const G1_ID = 'golden-g1';
export const G2_ID = 'golden-g2';
export const G3_ID = 'golden-g3';
export const G4_ID = 'golden-g4';

type Lie = ShotRecord['lieBefore'];
type Result = ShotRecord['result'];

/** One stroke as the tracker records it. `from` and `to` are yards off the green, feet on it (and on a green finish); 0 when holed. */
export interface GoldenShot {
  type: ShotRecord['shotType'];
  lie: Lie;
  from: number;
  result: Result;
  to: number;
  /** A penalty row (`is_penalty`): the stroke the drop costs, where the ball was. */
  penalty?: 'water' | 'ob';
}

/** One hole, with the audit's hand-computed line for it: (par, score, putts, fairway, penalty strokes, strokes from a greenside bunker). */
export interface GoldenHole {
  number: number;
  par: number;
  yardage: number;
  shots: GoldenShot[];
  expected: {
    score: number;
    putts: number;
    /** Par 4 and 5 only; null on a par 3. */
    fairway: boolean | null;
    gir: boolean;
    penalties: number;
    /** Strokes taken from the first greenside-bunker shot to holing out, the bunker shot included; null when no greenside bunker. */
    sandStrokes: number | null;
  };
}

const tee = (from: number, result: Result, to: number): GoldenShot => ({ type: 'tee', lie: 'tee', from, result, to });
const app = (lie: Lie, from: number, result: Result, to: number): GoldenShot => ({ type: 'approach', lie, from, result, to });
const chip = (lie: Lie, from: number, result: Result, to: number): GoldenShot => ({ type: 'around_green', lie, from, result, to });
const putt = (from: number, to: number): GoldenShot => ({ type: 'putting', lie: 'green', from, result: to === 0 ? 'hole' : 'green', to });
const drop = (lie: Lie, at: number, kind: 'water' | 'ob'): GoldenShot => ({ type: 'penalty', lie, from: at, result: 'penalty', to: at, penalty: kind });

const hole = (
  number: number,
  par: number,
  yardage: number,
  shots: GoldenShot[],
  expected: GoldenHole['expected'],
): GoldenHole => ({ number, par, yardage, shots, expected });

const e = (score: number, putts: number, fairway: boolean | null, gir: boolean, penalties: number, sandStrokes: number | null) => ({
  score,
  putts,
  fairway,
  gir,
  penalties,
  sandStrokes,
});

/** G1: pars 4 4 3 5 4 4 3 4 5 | 4 3 4 5 4 4 3 4 5. */
export const G1_HOLES: readonly GoldenHole[] = [
  hole(1, 4, 400, [tee(400, 'fairway', 140), app('fairway', 140, 'green', 25), putt(25, 3), putt(3, 0)], e(4, 2, true, true, 0, null)),
  hole(2, 4, 420, [tee(420, 'fairway', 160), app('fairway', 160, 'green', 40), putt(40, 6), putt(6, 2), putt(2, 0)], e(5, 3, true, true, 0, null)),
  hole(3, 3, 170, [tee(170, 'sand', 15), chip('sand', 15, 'green', 6), putt(6, 0)], e(3, 1, null, false, 0, 2)),
  hole(4, 5, 520, [tee(520, 'fairway', 250), app('fairway', 250, 'fairway', 60), app('fairway', 60, 'green', 8), putt(8, 0)], e(4, 1, true, true, 0, null)),
  // Chipped in: no putt, not a green in regulation, a scramble made.
  hole(5, 4, 380, [tee(380, 'rough', 130), app('rough', 130, 'rough', 20), chip('rough', 20, 'hole', 0)], e(3, 0, false, false, 0, null)),
  hole(6, 4, 440, [tee(440, 'other', 200), drop('other', 200, 'water'), app('rough', 200, 'rough', 30), chip('rough', 30, 'green', 12), putt(12, 2), putt(2, 0)], e(6, 2, false, false, 1, null)),
  // Out of the bunker in three: an attempt, not a save on any definition.
  hole(7, 3, 190, [tee(190, 'sand', 20), chip('sand', 20, 'green', 30), putt(30, 3), putt(3, 0)], e(4, 2, null, false, 0, 3)),
  hole(8, 4, 410, [tee(410, 'rough', 150), app('rough', 150, 'green', 30), putt(30, 2), putt(2, 0)], e(4, 2, false, true, 0, null)),
  hole(9, 5, 540, [tee(540, 'fairway', 270), app('fairway', 270, 'fairway', 100), app('fairway', 100, 'sand', 10), chip('sand', 10, 'green', 4), putt(4, 0)], e(5, 1, true, false, 0, 2)),
  // A bogey out of the bunker in two after a penalty: a save on the Tour definition (SC-02), not on the app's old par-or-better rule,
  // and a scramble too since scrambling counts sand saves (20261116200000).
  hole(10, 4, 430, [tee(430, 'other', 210), drop('other', 210, 'water'), app('rough', 210, 'sand', 15), chip('sand', 15, 'green', 5), putt(5, 0)], e(5, 1, false, false, 1, 2)),
  hole(11, 3, 160, [tee(160, 'green', 20), putt(20, 2), putt(2, 0)], e(3, 2, null, true, 0, null)),
  hole(12, 4, 390, [tee(390, 'rough', 140), app('rough', 140, 'rough', 15), chip('rough', 15, 'green', 3), putt(3, 0)], e(4, 1, false, false, 0, null)),
  hole(13, 5, 530, [tee(530, 'fairway', 260), app('fairway', 260, 'fairway', 90), app('fairway', 90, 'green', 15), putt(15, 2), putt(2, 0)], e(5, 2, true, true, 0, null)),
  hole(14, 4, 400, [tee(400, 'fairway', 130), app('fairway', 130, 'green', 18), putt(18, 2), putt(2, 0)], e(4, 2, true, true, 0, null)),
  hole(15, 4, 450, [tee(450, 'rough', 170), app('rough', 170, 'rough', 25), chip('rough', 25, 'green', 8), putt(8, 1), putt(1, 0)], e(5, 2, false, false, 0, null)),
  hole(16, 3, 180, [tee(180, 'green', 35), putt(35, 3), putt(3, 0)], e(3, 2, null, true, 0, null)),
  hole(17, 4, 410, [tee(410, 'fairway', 145), app('fairway', 145, 'green', 22), putt(22, 2), putt(2, 0)], e(4, 2, true, true, 0, null)),
  hole(18, 5, 560, [tee(560, 'fairway', 280), app('fairway', 280, 'fairway', 110), app('fairway', 110, 'green', 45), putt(45, 8), putt(8, 2), putt(2, 0)], e(6, 3, true, true, 0, null)),
];

/** The audit's G1 table. Percentages to two places, as the audit prints them. */
export const G1_EXPECTED = {
  total: 77,
  toPar: 5,
  frontNine: 38,
  backNine: 39,
  gir: { made: 10, of: 18, pct: 55.56 },
  fairways: { made: 8, of: 14, pct: 57.14 },
  putts: 31,
  puttsPerGir: 2.1,
  /** Scrambling counts sand saves (20261116200000): the hole 10 bogey sand save is a fifth. */
  scrambling: { made: 5, of: 8, pct: 62.5 },
  onePutts: 5,
  threePutts: 2,
  penaltyStrokes: 2,
  /** Tour definition: out of a greenside bunker and holed in two strokes or fewer, whatever the score (hole 10 counts). */
  sandSavesTour: { made: 3, of: 4 },
  /** The app's rule before SC-02: also needed par or better (hole 10 does not count). */
  sandSavesOldAppRule: { made: 2, of: 4 },
  parAverages: { par3: 3.25, par4: 4.4, par5: 5 },
} as const;

/** G2's front nine, hole by hole (no shots): (par, score, putts, fairway). */
export const G2_HOLES: ReadonlyArray<{ number: number; par: number; score: number; putts: number; fairway: boolean | null; gir: boolean }> = [
  { number: 1, par: 4, score: 4, putts: 2, fairway: true, gir: true },
  { number: 2, par: 4, score: 4, putts: 2, fairway: true, gir: true },
  { number: 3, par: 3, score: 3, putts: 2, fairway: null, gir: true },
  { number: 4, par: 5, score: 4, putts: 2, fairway: true, gir: true },
  { number: 5, par: 4, score: 5, putts: 2, fairway: false, gir: false },
  { number: 6, par: 4, score: 4, putts: 1, fairway: false, gir: false },
  { number: 7, par: 3, score: 4, putts: 2, fairway: null, gir: false },
  { number: 8, par: 4, score: 4, putts: 1, fairway: true, gir: false },
  { number: 9, par: 5, score: 6, putts: 2, fairway: false, gir: false },
];

export const G2_EXPECTED = {
  total: 38,
  putts: 16,
  gir: { made: 4, of: 9 },
  fairways: { made: 4, of: 7 },
  scrambling: { made: 2, of: 5 },
} as const;

/** Figures over a window holding G1 to G4 (the audit's second table). */
export const WINDOW_EXPECTED = {
  /** (77 + 76) / 2: eighteen-hole rounds only. */
  scoringAverage18: 76.5,
  /** (77 + 38 + 76) / 2.5: any length, a nine weighs 0.5. */
  scoringAverageAnyLength: 76.4,
  /** G3's 76; G2's 38 normalized is 76 too. Never G4's 37. */
  bestRound: 76,
  /** (31 + 16) / 1.5. Never the unweighted 23.50 or production's 13.43. */
  puttsPer18: 31.33,
  puttsPer18Wrong: [23.5, 13.43],
  /** 14 of 27 holes. */
  girPooled: { made: 14, of: 27, pct: 51.85 },
  /** The rounds counted: G4 never is. */
  countedRoundIds: [G3_ID, G2_ID, G1_ID],
  g4: { total: 37, strokesGained: 34.51 },
} as const;

// ---------------------------------------------------------------- shapes the code reads

const ON_GREEN = new Set<Result>(['green', 'hole']);

function units(s: GoldenShot) {
  const before = s.lie === 'green' ? 'feet' : 'yards';
  const after = ON_GREEN.has(s.result) ? 'feet' : 'yards';
  const toYards = after === 'feet' ? s.to / 3 : s.to;
  const fromYards = before === 'feet' ? s.from / 3 : s.from;
  const shotDistance = s.penalty || s.type === 'putting' ? 0 : Math.max(0, Math.round(fromYards - toYards));
  return { before, after, shotDistance } as const;
}

function club(s: GoldenShot, par: number): ShotRecord['clubType'] {
  if (s.type === 'putting') return 'putter';
  return s.type === 'tee' && par >= 4 ? 'driver' : 'non_driver';
}

/** The tracker's shot records for one G1 hole (what `calculateHoleStats` reads on the phone). */
export function g1ShotRecords(h: GoldenHole): ShotRecord[] {
  return h.shots.map((s, i) => {
    const u = units(s);
    return {
      id: `${G1_ID}-h${h.number}-s${i + 1}`,
      shotNumber: i + 1,
      shotType: s.type,
      clubType: club(s, h.par),
      lieBefore: s.lie,
      distanceToHoleBefore: s.from,
      distanceUnitBefore: u.before,
      result: s.result,
      distanceToHoleAfter: s.to,
      distanceUnitAfter: u.after,
      shotDistance: u.shotDistance,
      isPenalty: s.penalty != null,
      ...(s.penalty ? { penaltyType: s.penalty } : {}),
      ...(s.type === 'putting' ? { puttDistanceFeet: s.from } : {}),
    };
  });
}

/** G1's `golf_shots` rows, as the calculator and the SQL read them (hole_id is `<round>-h<n>`). */
export function g1RawShots(): RawShot[] {
  return G1_HOLES.flatMap((h) =>
    g1ShotRecords(h).map((r): RawShot => ({
      id: r.id!,
      round_id: G1_ID,
      hole_id: `${G1_ID}-h${h.number}`,
      hole_number: h.number,
      shot_number: r.shotNumber,
      shot_type: r.shotType,
      club_type: r.clubType,
      lie_before: r.lieBefore,
      distance_to_hole_before: r.distanceToHoleBefore,
      distance_unit_before: r.distanceUnitBefore,
      result: r.result,
      distance_to_hole_after: r.distanceToHoleAfter,
      distance_unit_after: r.distanceUnitAfter,
      shot_distance: r.shotDistance,
      miss_direction: null,
      putt_break: null,
      putt_distance_feet: r.shotType === 'putting' ? r.distanceToHoleBefore : null,
      putt_slope: null,
      putt_made: r.shotType === 'putting' ? r.result === 'hole' : null,
      is_penalty: r.isPenalty,
      penalty_type: r.penaltyType ?? null,
    })),
  );
}

/**
 * G1's holes for the calculator. `stored: false` leaves the per-hole flags out, so the calculator derives everything from the
 * shots; `stored: true` adds the columns the database holds (score, putts, fairway, gir, penalty strokes and the Tour sand-save flag).
 */
export function g1HoleInfos({ stored }: { stored: boolean }): HoleInfo[] {
  return G1_HOLES.map((h) => ({
    id: `${G1_ID}-h${h.number}`,
    round_id: G1_ID,
    hole_number: h.number,
    par: h.par,
    yardage: h.yardage,
    ...(stored
      ? {
          score: h.expected.score,
          putts: h.expected.putts,
          fairway_hit: h.expected.fairway,
          gir: h.expected.gir,
          penalty_strokes: h.expected.penalties,
          sand_save: h.expected.sandStrokes == null ? null : h.expected.sandStrokes <= 2,
        }
      : {}),
  }));
}

export function g2HoleInfos(): HoleInfo[] {
  return G2_HOLES.map((h) => ({
    id: `${G2_ID}-h${h.number}`,
    round_id: G2_ID,
    hole_number: h.number,
    par: h.par,
    yardage: null,
    score: h.score,
    putts: h.putts,
    fairway_hit: h.fairway,
    gir: h.gir,
    penalty_strokes: 0,
    sand_save: null,
  }));
}

export const GOLDEN_ROUND_INFOS: readonly RoundInfo[] = [
  { id: G1_ID, round_date: '2026-10-01', course_name: 'Golden Course', round_type: 'tournament', course_par: 72, holes_played: 18 },
  { id: G2_ID, round_date: '2026-10-05', course_name: 'Golden Course', round_type: 'tournament', course_par: 36, holes_played: 9 },
];

/**
 * The four rounds as `golf_rounds` rows (the columns Clubhouse's season loader selects, plus `is_test` and `status`, which it filters
 * on). G1 and G2 carry the totals the database writes from their holes; G3 has none; G4 is the test round.
 */
export function goldenRoundRows(): Array<Record<string, unknown>> {
  const base = {
    player_id: GOLDEN_PLAYER_ID,
    course_id: null,
    course_name: 'Golden Course',
    tees_played: 'Blue',
    status: 'completed',
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    strokes_gained_putting: null,
  };
  return [
    {
      ...base,
      id: G1_ID,
      is_test: false,
      round_date: '2026-10-01',
      round_type: 'tournament',
      total_score: 77,
      score_to_par: 5,
      front_nine: 38,
      back_nine: 39,
      holes_played: 18,
      total_putts: 31,
      total_gir: 10,
      total_gir_possible: 18,
      total_fairways_hit: 8,
      total_fairways: 14,
      strokes_gained_total: null,
    },
    {
      ...base,
      id: G2_ID,
      is_test: false,
      round_date: '2026-10-05',
      round_type: 'tournament',
      total_score: 38,
      score_to_par: 2,
      front_nine: 38,
      back_nine: null,
      holes_played: 9,
      total_putts: 16,
      total_gir: 4,
      total_gir_possible: 9,
      total_fairways_hit: 4,
      total_fairways: 7,
      strokes_gained_total: null,
    },
    {
      ...base,
      id: G3_ID,
      is_test: false,
      round_date: '2026-10-10',
      round_type: 'tournament',
      total_score: 76,
      score_to_par: 4,
      front_nine: null,
      back_nine: null,
      holes_played: 18,
      total_putts: null,
      total_gir: null,
      total_gir_possible: null,
      total_fairways_hit: null,
      total_fairways: null,
      strokes_gained_total: null,
    },
    {
      ...base,
      id: G4_ID,
      is_test: true,
      round_date: '2026-10-12',
      round_type: 'tournament',
      total_score: 37,
      score_to_par: -35,
      front_nine: 18,
      back_nine: 19,
      holes_played: 18,
      total_putts: 10,
      total_gir: 18,
      total_gir_possible: 18,
      total_fairways_hit: 14,
      total_fairways: 14,
      strokes_gained_total: 34.51,
    },
  ];
}

// ---------------------------------------------------------------- the pgTAP twin

/** Where the SQL twin lives. stats-golden.test.ts fails when it is not `goldenPgTapSql()` byte for byte. */
export const GOLDEN_PGTAP_PATH = 'supabase/tests/rls/stats_golden_rounds.sql';

const uuid = (group: string, n: number) => `00000000-0000-0000-${group}-${String(n).padStart(12, '0')}`;
export const G1_SQL_ROUND_ID = uuid('901d', 1);
const SQL_USER_ID = uuid('9010', 1);
const SQL_PLAYER_ID = uuid('9011', 1);
const sqlHoleId = (n: number) => uuid('901e', n);
const sqlShotId = (hole: number, shot: number) => uuid('901f', hole * 100 + shot);
const lit = (v: string | number | boolean | null) => (v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v).toUpperCase());

/**
 * G1 written the way the database stores a tracked round (holes with the columns the submit writes, the sand flag on the Tour
 * definition, then the shots), completed under the lifecycle mark, and every SQL figure checked against `G1_EXPECTED`. Generated
 * from this file so the two cannot drift; regenerate with `HELM_WRITE_GOLDEN_SQL=1 npm run test:file -- src/clubhouse/__tests__/stats-golden.test.ts`.
 */
export function goldenPgTapSql(): string {
  const ex = G1_EXPECTED;
  const checks: string[] = [];
  const is = (sql: string, want: number, what: string) => checks.push(`SELECT is((${sql}), ${want}, ${lit(what)});`);
  const round = (col: string) => `SELECT ${col} FROM public.golf_rounds WHERE id = '${G1_SQL_ROUND_ID}'`;
  const cache = (col: string) => `SELECT ${col} FROM public.golf_round_stats_cache WHERE round_id = '${G1_SQL_ROUND_ID}'`;

  is(`SELECT count(*)::int FROM public.golf_holes WHERE round_id = '${G1_SQL_ROUND_ID}' AND gir`, ex.gir.made, 'G1: the hole trigger marks 10 greens in regulation');
  is(round('total_score'), ex.total, 'G1 round: total 77');
  is(round('total_putts'), ex.putts, 'G1 round: 31 putts');
  is(round('total_gir'), ex.gir.made, 'G1 round: 10 greens');
  is(round('total_gir_possible'), ex.gir.of, 'G1 round: of 18');
  is(round('total_fairways_hit'), ex.fairways.made, 'G1 round: 8 fairways');
  is(round('total_fairways'), ex.fairways.of, 'G1 round: of 14');
  is(cache('total_score'), ex.total, 'G1 cache: total 77');
  is(cache('front_nine'), ex.frontNine, 'G1 cache: front nine 38');
  is(cache('back_nine'), ex.backNine, 'G1 cache: back nine 39');
  is(cache('greens_hit'), ex.gir.made, 'G1 cache: 10 greens');
  is(cache('greens_total'), ex.gir.of, 'G1 cache: of 18');
  is(cache('fairways_hit'), ex.fairways.made, 'G1 cache: 8 fairways');
  is(cache('fairways_total'), ex.fairways.of, 'G1 cache: of 14');
  is(cache('total_putts'), ex.putts, 'G1 cache: 31 putts');
  is(cache('one_putts'), ex.onePutts, 'G1 cache: 5 one-putts');
  is(cache('three_putts'), ex.threePutts, 'G1 cache: 2 three-putts');
  is(cache('scrambles_converted'), ex.scrambling.made, 'G1 cache: 5 scrambles (the hole 5 chip-in and the hole 10 sand save count)');
  is(cache('scramble_attempts'), ex.scrambling.of, 'G1 cache: of 8');
  is(cache('sand_saves'), ex.sandSavesTour.made, 'G1 cache: 3 sand saves on the Tour definition');
  is(cache('sand_attempts'), ex.sandSavesTour.of, 'G1 cache: of 4');
  is(cache('penalty_strokes'), ex.penaltyStrokes, 'G1 cache: 2 penalty strokes');

  const holeRows = G1_HOLES.map((h) => {
    const x = h.expected;
    const sand = x.sandStrokes == null ? null : x.sandStrokes <= 2;
    return `  (${lit(sqlHoleId(h.number))}, ${lit(G1_SQL_ROUND_ID)}, ${h.number}, ${h.par}, ${h.yardage}, ${x.score}, ${x.putts}, ${lit(x.fairway)}, ${lit(sand)}, ${x.penalties})`;
  });
  const shotRows = G1_HOLES.flatMap((h) =>
    g1ShotRecords(h).map(
      (s) =>
        `  (${lit(sqlShotId(h.number, s.shotNumber))}, ${lit(G1_SQL_ROUND_ID)}, ${lit(sqlHoleId(h.number))}, ${h.number}, ${s.shotNumber}, ${lit(s.shotType)}, ${lit(s.clubType)}, ${lit(s.lieBefore)}, ${s.distanceToHoleBefore}, ${lit(s.distanceUnitBefore)}, ${lit(s.result)}, ${s.distanceToHoleAfter}, ${lit(s.distanceUnitAfter)}, ${s.shotDistance}, ${lit(s.isPenalty)}, ${lit(s.penaltyType ?? null)}, ${s.shotType === 'putting' ? lit(s.result === 'hole') : 'NULL'})`,
    ),
  );

  return [
    '-- GENERATED from src/clubhouse/__tests__/stats-golden.fixtures.ts (goldenPgTapSql). Do not edit by hand:',
    '-- HELM_WRITE_GOLDEN_SQL=1 npm run test:file -- src/clubhouse/__tests__/stats-golden.test.ts',
    '--',
    '-- Golden round G1 (stats and charts audit 2026-11-15, section 3) through the SQL paths: the golf_holes GIR trigger,',
    '-- recompute_golf_round_totals (golf_rounds totals) and update_round_stats_cache (golf_round_stats_cache). The TypeScript',
    '-- paths assert the same numbers in stats-golden.test.ts. Holes carry sand_save on the Tour definition (out of a greenside',
    '-- bunker in two strokes or fewer, whatever the score), the value the app writes after SC-02.',
    '',
    'BEGIN;',
    '\\ir _helpers.sql',
    '',
    `SELECT plan(${checks.length});`,
    '',
    `INSERT INTO auth.users (id, email, role) VALUES (${lit(SQL_USER_ID)}, 'golden-player@helm.test', 'authenticated') ON CONFLICT DO NOTHING;`,
    `INSERT INTO public.users (id, email, role) VALUES (${lit(SQL_USER_ID)}, 'golden-player@helm.test', 'player') ON CONFLICT DO NOTHING;`,
    `INSERT INTO public.golf_players (id, user_id, first_name) VALUES (${lit(SQL_PLAYER_ID)}, ${lit(SQL_USER_ID)}, 'Golden Player') ON CONFLICT DO NOTHING;`,
    `INSERT INTO public.golf_rounds (id, player_id, round_date, status, round_type, holes_played, course_name)`,
    `VALUES (${lit(G1_SQL_ROUND_ID)}, ${lit(SQL_PLAYER_ID)}, '2026-10-01', 'in_progress', 'tournament', 18, 'Golden Course');`,
    '',
    "-- The player's identity for the hole writes, as the app's save runs them.",
    `SELECT set_config('request.jwt.claims', json_build_object('sub', ${lit(SQL_USER_ID)}, 'role', 'authenticated')::text, true);`,
    'INSERT INTO public.golf_holes (id, round_id, hole_number, par, yardage, score, putts, fairway_hit, sand_save, penalty_strokes) VALUES',
    `${holeRows.join(',\n')};`,
    "SELECT set_config('request.jwt.claims', '', true);",
    '',
    'INSERT INTO public.golf_shots (id, round_id, hole_id, hole_number, shot_number, shot_type, club_type, lie_before, distance_to_hole_before, distance_unit_before, result, distance_to_hole_after, distance_unit_after, shot_distance, is_penalty, penalty_type, putt_made) VALUES',
    `${shotRows.join(',\n')};`,
    '',
    '-- Complete the round under the lifecycle mark, with the totals round-submit writes from the holes.',
    "SELECT set_config('helm.golf_lifecycle_write', 'atomic', true);",
    `UPDATE public.golf_rounds SET status = 'completed', total_score = ${ex.total}, score_to_par = ${ex.toPar}, front_nine = ${ex.frontNine}, back_nine = ${ex.backNine} WHERE id = ${lit(G1_SQL_ROUND_ID)};`,
    "SELECT set_config('helm.golf_lifecycle_write', '', true);",
    '',
    ...checks,
    '',
    'SELECT * FROM finish();',
    'ROLLBACK;',
    '',
  ].join('\n');
}
