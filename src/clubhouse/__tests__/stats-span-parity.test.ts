/**
 * "All time" (data/span.ts, `?range=all`) against Fairway, on the same rows: Clubhouse's loaders as they run, and production's own code
 * (the Fairway Team stats page, getDetailedStats and aggregateCountableRounds), through the evaluating fake as in
 * stats-production-parity.test.ts. The season's rules (since 1 August, practice out, a three-round floor) are the default and are
 * checked to differ; All time is Fairway's, so its figures are held to Fairway's at the precision the screen shows.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';


vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined), logServerEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/supabase/server', async () => {
  const { parityState } = await import('./parity-state');
  const { evalServer } = await import('./supabase-eval-fake');
  return evalServer({ get current() { return parityState.db; } });
});
vi.mock('@/lib/supabase/admin', async () => {
  const { parityState } = await import('./parity-state');
  const { evalClient } = await import('./supabase-eval-fake');
  return { createAdminClient: () => evalClient({ get current() { return parityState.db; } }) };
});
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: vi.fn(async () => ({ coach: { id: 'c1', organization_id: 'o1' }, player: null })),
  getGolfAuthUser: vi.fn(async () => ({ user: { id: 'parity-viewer' }, degraded: false })),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: vi.fn(async () => ({ allowed: true, role: 'coach' })) }));
vi.mock('@/app/golf/actions/stats-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/golf/actions/stats-data')>()),
  // The spray chart is not a figure compared here.
  getSprayChartData: vi.fn(async () => {
    throw new Error('parity: spray not read');
  }),
}));
// The Fairway Team stats page's own reads that feed no compared figure, and its gates.
vi.mock('@/clubhouse/routes/alias', () => ({ redirectToClubhouse: vi.fn(async () => undefined) }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: vi.fn(async () => false) }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: vi.fn(async () => 'coach') }));
vi.mock('@/clubhouse/routes/stats', () => ({ ClubhouseStatsRoute: () => null }));
vi.mock('@/lib/golf/resolve-team-server', async () => {
  const { parityState } = await import('./parity-state');
  return { resolveCoachTeamIdWithCookie: vi.fn(async () => parityState.teamId) };
});
vi.mock('@/app/golf/actions/stats-intelligence', () => ({ getTeamStatsIntelligence: vi.fn(async () => ({ success: false })) }));
vi.mock('@/app/golf/actions/stats-leak-maps', () => ({ getTeamLeakMaps: vi.fn(async () => ({ success: false })) }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayersStandingMap: vi.fn(async () => new Map()) }));
vi.mock('@/components/golf/stats/team-board/TeamStatsBoard', () => ({ TeamStatsBoard: Object.assign(() => null, { parityBoard: true }) }));
vi.mock('@/components/fairway', () => ({ ViewHeader: () => null, EmptyState: () => null, Button: () => null }));

import { aggregateCountableRounds, type CountableRoundRow } from '@/lib/golf/countable-round-stats';
import { filterFor, withSpan, type ChFilter } from '../data/stats-filter';
import type { EvalDb, Row } from './supabase-eval-fake';
import { clubhousePlayer, clubhouseTeam, fairwayDetail, fairwayTeam, holeRoundIds, pair, playerPairs, sameOnScreen, teamPairs, type Pair } from './stats-parity-harness';

/** Par 72: front and back nine each 36. */
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
/** To-par per hole, rotated by a seed, so rounds differ. */
const DIFFS = [0, 1, 0, -1, 0, 2, 0, 1, 0, 0, 1, -1, 0, 0, 1, 0, 0, 1];

interface Spec {
  id: string;
  player: string;
  date: string;
  type?: 'practice' | 'qualifier' | 'tournament';
  holes?: 9 | 18;
  seed?: number;
  status?: string;
  test?: boolean;
  /** No hole carries a putt count (production's round totals then write 0 putts). */
  noPutts?: boolean;
  /** This many par-4/5 holes have no fairway result. */
  fwNull?: number;
  /** An eagle on the first par 5. */
  eagle?: boolean;
  /** Posted as a total only: no holes, no nines. */
  totalOnly?: number;
  /** Declared 18 holes, only the front nine entered. */
  partial?: boolean;
  sg?: number;
}

/** A round, its holes and its cache row, built the way production's triggers build them (recompute_golf_round_totals, update_round_stats_cache). */
function build(specs: Spec[], teams: Array<{ id: string; players: string[]; gender?: string }>): EvalDb {
  const rounds: Row[] = [];
  const holes: Row[] = [];
  const cache: Row[] = [];
  for (const s of specs) {
    const n = s.holes ?? 18;
    const sg = s.sg ?? null;
    const legs = sg == null ? [null, null, null, null] : [sg * 0.2, sg * 0.4, sg * 0.1, sg * 0.3];
    const base = {
      id: s.id, player_id: s.player, course_name: 'Pines', tees_played: 'Blue', round_date: s.date, round_type: s.type ?? 'practice', holes_played: n,
      status: s.status ?? 'completed', is_test: !!s.test,
      strokes_gained_total: sg, strokes_gained_tee: legs[0], strokes_gained_approach: legs[1], strokes_gained_around_green: legs[2], strokes_gained_putting: legs[3],
    };
    if (s.totalOnly != null) {
      rounds.push({ ...base, total_score: s.totalOnly, score_to_par: s.totalOnly - 72, front_nine: null, back_nine: null, total_putts: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null });
      cache.push({ round_id: s.id, player_id: s.player, total_score: s.totalOnly, score_to_par: s.totalOnly - 72, fairways_hit: null, fairways_total: null, greens_hit: null, greens_total: null, total_putts: null, one_putts: 0, three_putts: 0, scrambles_converted: 0, scramble_attempts: 0, sand_saves: 0, sand_attempts: 0, eagles: 0, birdies: 0, pars: 0, bogeys: 0, double_bogeys: 0, triple_plus: 0, penalty_strokes: 0, ...pickSg(base) });
      continue;
    }
    const entered = s.partial ? 9 : n;
    const hs: Row[] = [];
    let fwNull = s.fwNull ?? 0;
    for (let i = 0; i < entered; i++) {
      const par = PARS[i]!;
      let d = DIFFS[(i + (s.seed ?? 0)) % DIFFS.length]!;
      if (s.eagle && i === 3) d = -2;
      const score = par + d;
      const putts = s.noPutts ? null : d <= -1 ? 1 : d >= 2 || (i + (s.seed ?? 0)) % 7 === 0 ? 3 : 2;
      const gir = score - (putts ?? 0) <= par - 2;
      let fairway: boolean | null = par >= 4 ? (i + (s.seed ?? 0)) % 3 !== 0 : null;
      if (par >= 4 && fwNull > 0) {
        fairway = null;
        fwNull--;
      }
      hs.push({ id: `${s.id}-h${i + 1}`, round_id: s.id, hole_number: i + 1, par, yardage: par * 100, score, putts, fairway_hit: fairway, gir, sand_save: i % 6 === 2 ? d <= 0 : null, penalty_strokes: d >= 2 ? 1 : 0 });
    }
    holes.push(...hs);
    const sum = (f: (h: Row) => number) => hs.reduce((a, h) => a + f(h), 0);
    const front = sum((h) => ((h.hole_number as number) <= 9 ? (h.score as number) : 0));
    const back = sum((h) => ((h.hole_number as number) > 9 ? (h.score as number) : 0));
    const total = front + back;
    const toPar = total - sum((h) => h.par as number);
    const tot = {
      total_putts: sum((h) => (h.putts as number | null) ?? 0),
      total_gir: sum((h) => (h.gir ? 1 : 0)),
      total_gir_possible: hs.length,
      total_fairways_hit: sum((h) => ((h.par as number) >= 4 && h.fairway_hit === true ? 1 : 0)),
      total_fairways: sum((h) => ((h.par as number) >= 4 && h.fairway_hit != null ? 1 : 0)),
    };
    rounds.push({ ...base, total_score: total, score_to_par: toPar, front_nine: front, back_nine: n === 9 || s.partial ? null : back, ...tot });
    const dd = (h: Row) => (h.score as number) - (h.par as number);
    const withPutts = hs.filter((h) => h.putts != null);
    cache.push({
      round_id: s.id, player_id: s.player, total_score: total, score_to_par: toPar, front_nine: front, back_nine: back,
      fairways_hit: tot.total_fairways_hit, fairways_total: tot.total_fairways, greens_hit: tot.total_gir, greens_total: tot.total_gir_possible, total_putts: tot.total_putts,
      one_putts: withPutts.filter((h) => h.putts === 1).length, three_putts: withPutts.filter((h) => (h.putts as number) >= 3).length,
      scrambles_converted: hs.filter((h) => h.gir === false && dd(h) <= 0).length, scramble_attempts: hs.filter((h) => h.gir === false).length,
      sand_saves: hs.filter((h) => h.sand_save === true).length, sand_attempts: hs.filter((h) => h.sand_save != null).length,
      eagles: hs.filter((h) => dd(h) <= -2).length, birdies: hs.filter((h) => dd(h) === -1).length, pars: hs.filter((h) => dd(h) === 0).length,
      bogeys: hs.filter((h) => dd(h) === 1).length, double_bogeys: hs.filter((h) => dd(h) === 2).length, triple_plus: hs.filter((h) => dd(h) >= 3).length,
      penalty_strokes: sum((h) => h.penalty_strokes as number), ...pickSg(base),
    });
  }
  const players = [...new Set(teams.flatMap((t) => t.players))];
  return {
    tables: {
      golf_teams: teams.map((t) => ({ id: t.id, name: `Team ${t.id}`, gender: t.gender ?? 'mens' })),
      golf_team_members: teams.flatMap((t) => t.players.map((p) => ({ team_id: t.id, player_id: p, status: 'active' }))),
      golf_players: players.map((p) => ({ id: p, first_name: p, last_name: 'X', graduation_year: 2028, handicap: null, handicap_index: null, hometown: null, state: null, avatar_url: null })),
      golf_rounds: rounds,
      golf_round_stats_cache: cache,
      golf_holes: holes,
      golf_shots: [],
      putt_details: [],
      approach_miss_details: [],
      golf_pga_standards: [],
      golf_patterns_v2: [],
      golf_player_focus_areas: [],
      golf_goals: [],
      golf_team_coach_staff: [],
      golf_coaches: [],
    },
    rpc: { sg_scale_for_player: () => 1 },
  };
}

function pickSg(r: Row): Row {
  return {
    strokes_gained_total: r.strokes_gained_total, strokes_gained_tee: r.strokes_gained_tee, strokes_gained_approach: r.strokes_gained_approach,
    strokes_gained_around_green: r.strokes_gained_around_green, strokes_gained_putting: r.strokes_gained_putting,
  };
}



afterEach(() => {
  vi.useRealTimers();
});

const NOW = new Date('2026-10-15T15:00:00Z');
const day = (iso: string, back: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);

/** Every pair matches on screen. */
function expectParity(pairs: Pair[], expected: (p: Pair) => string | null = () => null) {
  expect(pairs.length).toBeGreaterThan(0);
  const wrong = pairs.filter((p) => !expected(p) && !sameOnScreen(p)).map((p) => `${p.metric} ${p.scope}: clubhouse ${p.clubhouse} production ${p.production}`);
  expect(wrong).toEqual([]);
}
/** A rate under its floor has no value on Clubhouse (A7): fairways and greens need two rounds, scrambling and sand saves ten chances; production shows any. */
const rateFloor = (p: Pair) => (/(fairway|gir|scrambling|sandSave)Pct/.test(p.metric) && p.clubhouse == null && p.production != null ? 'A7 rate floor' : null);

/**
 * One team, built so that the season's rules and Fairway's part ways in every way the owner named:
 *  - pA: sixteen rounds in all three types, two of them before 1 August, a nine-hole round and an eagle;
 *  - pB: two practice rounds only (under any three-round floor);
 *  - pC: five rounds and one posted as a total only (Clubhouse's season counts it, Fairway's isCountableRound does not);
 *  - pD: a test round, a round in progress and a half-entered round, which count nowhere.
 */
function teamFixture(opts: { nine?: boolean } = {}): EvalDb {
  const types = ['tournament', 'qualifier', 'practice'] as const;
  const a: Spec[] = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, player: 'pA', date: day('2026-10-12', i * 6), type: types[i % 3], seed: i, sg: -1 + (i % 4) * 0.7 }));
  a[2] = { ...a[2]!, eagle: true };
  a.push({ id: 'a-old1', player: 'pA', date: '2025-11-02', type: 'tournament', seed: 3, sg: 0.4 }, { id: 'a-old2', player: 'pA', date: '2025-04-20', type: 'practice', seed: 6, sg: -0.2 });
  // Production averages a nine-hole round as a round of its own and Clubhouse per 18 holes (by design, see stats-production-parity), so the figures that pool both lengths are compared without it.
  if (opts.nine !== false) a.push({ id: 'a9', player: 'pA', date: '2026-10-01', holes: 9, seed: 1, sg: -2.6 });
  const b: Spec[] = [
    { id: 'b0', player: 'pB', date: '2026-10-01', type: 'practice', seed: 2, sg: 1.1 },
    { id: 'b1', player: 'pB', date: '2026-09-20', type: 'practice', seed: 4, sg: -0.4 },
  ];
  const c: Spec[] = [
    ...Array.from({ length: 5 }, (_, i): Spec => ({ id: `c${i}`, player: 'pC', date: day('2026-10-10', i * 4), type: i % 2 ? 'practice' : 'qualifier', seed: i + 7, sg: -2 + i * 0.5 })),
    { id: 'c-total', player: 'pC', date: '2026-10-13', type: 'qualifier', totalOnly: 70 },
  ];
  const d: Spec[] = [
    { id: 'd-test', player: 'pD', date: '2026-10-11', test: true, seed: 0, sg: 5 },
    { id: 'd-live', player: 'pD', date: '2026-10-12', status: 'in_progress', seed: 1 },
    { id: 'd-partial', player: 'pD', date: '2026-10-09', partial: true, seed: 2 },
  ];
  return build([...a, ...b, ...c, ...d], [{ id: 't1', players: ['pA', 'pB', 'pC', 'pD'] }]);
}

const season = filterFor('season');
const allTime: ChFilter = withSpan(season, 'all');

describe('All time against the Fairway Team stats page, same rounds', () => {
  it('scoring, the rounds counted and each player’s average are Fairway’s, on the career, with every round type in', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const fw = await fairwayTeam(db, 't1');
    const ch = await clubhouseTeam(db, 't1', allTime);
    // The rounds counted are Fairway’s eighteen-hole rounds: practice and 2025 included; the total-only, test, live and half-entered ones are on neither side.
    expect(ch.roundCount).toBe(fw.players.reduce((a, p) => a + p.rounds_played_18, 0));
    expect(ch.roundCount).toBe(16 + 2 + 5);
    expectParity(teamPairs(ch, fw, { scope: 'all-time', rates: false, scoring: true, sg: false }));
    // pB: practice only. Fairway shows them; so does All time (the season would show them as no round, and the leaderboard floors them out).
    expect(ch.grid.find((g) => g.id === 'pB')?.avg).toBeCloseTo(fw.players.find((p) => p.id === 'pB')!.scoring_average_18!, 6);
  });

  it('the hole figures (greens, scrambling, putts, birdies) are Fairway’s', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture({ nine: false });
    const fw = await fairwayTeam(db, 't1');
    const ch = await clubhouseTeam(db, 't1', allTime);
    expectParity(teamPairs(ch, fw, { scope: 'all-time', rates: true, scoring: true, sg: false }), rateFloor);
  });

  it('the window the address names changes nothing on All time: Last 10, Season and Qualifiers read the same career', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const season = await clubhouseTeam(db, 't1', withSpan(filterFor('season'), 'all'));
    for (const w of ['last10', 'qualifiers'] as const) {
      const other = await clubhouseTeam(db, 't1', withSpan(filterFor(w), 'all'));
      expect(other.roundCount).toBe(season.roundCount);
      expect(other.figures.find((f) => f.key === 'score')!.value).toBe(season.figures.find((f) => f.key === 'score')!.value);
      // No previous window to set it against: the career has none.
      expect(other.figures.find((f) => f.key === 'score')!.delta).toBeNull();
    }
  });

  it('the season keeps its rules: since 1 August, practice out, a total-only round in', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const fw = await fairwayTeam(db, 't1');
    const chSeason = await clubhouseTeam(db, 't1', season);
    const chAll = await clubhouseTeam(db, 't1', allTime);
    // pA 14 recent rounds, a third of them practice, none of the old ones; pB none; pC 2 qualifiers + total-only + the odd practice cut.
    expect(chSeason.roundCount).toBeLessThan(chAll.roundCount);
    const fwScoring = fw.teamScoring18!;
    const shown = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
    expect(shown(chSeason.figures.find((f) => f.key === 'score')!.value)).not.toBe(shown(fwScoring));
    expect(shown(chAll.figures.find((f) => f.key === 'score')!.value)).toBe(shown(fwScoring));
    // The season’s grid has no row of practice-only pB; All time does.
    expect(chSeason.grid.some((g) => g.id === 'pB')).toBe(false);
    expect(chAll.grid.some((g) => g.id === 'pB')).toBe(true);
  });
});

describe('All time against the Fairway player page (getDetailedStats), same rounds', () => {
  it('rounds, scoring average, to par and best round are Fairway’s, practice and last season’s rounds included', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture({ nine: false });
    const prof = (await clubhousePlayer(db, 't1', 'pA', allTime))!;
    expect(prof).not.toBeNull();
    const ids = holeRoundIds(db, prof);
    expect(ids).toEqual(expect.arrayContaining(['a-old1', 'a-old2']));
    const s = await fairwayDetail(db, 'pA', ids);
    const fw = await fairwayTeam(db, 't1');
    const pairs = playerPairs(prof, s, 'all-time:pA', fw.players.find((p) => p.id === 'pA')).filter((p) => /^player\.(rounds|scoringAvg|toPar|bestRound)$/.test(p.metric));
    expect(pairs).toHaveLength(4);
    expectParity(pairs);
    // And on the career the profile counts every one of Fairway’s rounds.
    expect(prof.win.holeRounds).toBe(s.roundsPlayed);
  });
});

describe('Fairway’s own function on the same rows (aggregateCountableRounds)', () => {
  it('a player’s All time scoring average is its scoring average, to the digit', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    for (const pid of ['pA', 'pB', 'pC']) {
      const rows = (db.tables.golf_rounds ?? []).filter((r) => r.player_id === pid && r.status === 'completed' && !r.is_test).sort((x: Row, y: Row) => (x.round_date as string) < (y.round_date as string) ? 1 : -1);
      const headline = aggregateCountableRounds(rows as unknown as CountableRoundRow[]);
      const ch = await clubhouseTeam(db, 't1', allTime);
      const row = ch.grid.find((g) => g.id === pid)!;
      expect(pair('scoringAvg', pid, row.avg, headline.scoringAverage, 1).clubhouse).not.toBeNull();
      expect(sameOnScreen(pair('scoringAvg', pid, row.avg, headline.scoringAverage, 1))).toBe(true);
    }
  });
});
