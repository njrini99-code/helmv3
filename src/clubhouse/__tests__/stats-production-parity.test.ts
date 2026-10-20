import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Clubhouse Stats against production's (Fairway's) stats, on the same rows (P004 team, P005 player). Both pipelines read one
 * evaluating fake (supabase-eval-fake.ts): Clubhouse's loaders as they run, and production's own code (the Fairway Team
 * stats page and getDetailedStats, see stats-parity-harness.ts). Every metric either matches at the precision the screen
 * shows, or the test names the rule that makes it differ on purpose (docs/clubhouse/pages/P004-stats-team/CONTRACT.md,
 * "Parity with production").
 *
 * The real-data pass at the bottom runs only when CH_STATS_REALDATA names a read-only dump (one JSON file per table).
 */

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

import { filterFor, type ChFilter } from '../data/stats-filter';
import type { EvalDb, Row } from './supabase-eval-fake';
import { clubhousePlayer, clubhouseTeam, fairwayDetail, fairwayTeam, holeRoundIds, playerPairs, sameOnScreen, standingPairs, subsetDb, teamPairs, teamWindowRoundIds, type Pair } from './stats-parity-harness';

const range = (f: ChFilter, holes: ChFilter['holes']): ChFilter => ({ ...f, from: '2000-01-01', holes });

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------- fixtures: rows as production writes them

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

/** Every pair matches on screen, except the ones `expected` names a reason for (the reason is the rule, asserted to still differ). */
function expectParity(pairs: Pair[], expected: (p: Pair) => string | null = () => null) {
  expect(pairs.length).toBeGreaterThan(0);
  const wrong = pairs.filter((p) => !expected(p) && !sameOnScreen(p)).map((p) => `${p.metric} ${p.scope}: clubhouse ${p.clubhouse} production ${p.production}`);
  expect(wrong).toEqual([]);
}

const day = (iso: string, back: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
const NOW = new Date('2026-10-15T15:00:00Z');

/** One team: a full player (season boundary, an eagle, a round with no putts, unknown fairways, two nine-hole rounds, every type), a one-round player, and one whose uncountable rounds must not count. */
function teamFixture(extra: Spec[] = []): EvalDb {
  const types = ['tournament', 'qualifier', 'practice'] as const;
  const a: Spec[] = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, player: 'pA', date: day('2026-10-12', i * 6), type: types[i % 3], seed: i, sg: -1 + (i % 4) * 0.7 }));
  a[2] = { ...a[2]!, eagle: true };
  a[4] = { ...a[4]!, noPutts: true };
  a[5] = { ...a[5]!, fwNull: 3 };
  // The season starts on 1 August: a round on 31 July is last season's, one on 1 August this season's.
  a.push({ id: 'a-jul31', player: 'pA', date: '2026-07-31', type: 'qualifier', seed: 3, sg: 0.4 }, { id: 'a-aug1', player: 'pA', date: '2026-08-01', type: 'tournament', seed: 5, sg: -0.2 });
  a.push({ id: 'a9-1', player: 'pA', date: day('2026-10-12', 2), holes: 9, seed: 1, sg: -2.6 }, { id: 'a9-2', player: 'pA', date: day('2026-10-12', 9), holes: 9, seed: 4, sg: -1.9 });
  const b: Spec[] = [{ id: 'b0', player: 'pB', date: '2026-10-01', type: 'tournament', seed: 2, sg: 1.1 }];
  const c: Spec[] = [
    ...Array.from({ length: 6 }, (_, i): Spec => ({ id: `c${i}`, player: 'pC', date: day('2026-10-10', i * 4), type: i % 2 ? 'practice' : 'qualifier', seed: i + 7, sg: -2 + i * 0.5 })),
    { id: 'c-test', player: 'pC', date: '2026-10-11', test: true, seed: 0, sg: 5 },
    { id: 'c-live', player: 'pC', date: '2026-10-12', status: 'in_progress', seed: 1 },
    { id: 'c-partial', player: 'pC', date: '2026-10-09', partial: true, seed: 2 },
  ];
  return build([...a, ...b, ...c, ...extra], [{ id: 't1', players: ['pA', 'pB', 'pC'] }]);
}

/** Strokes gained needs three whole rounds on Clubhouse (MIN_SG_ROUNDS); production's Team stats row shows any. */
const sgFloor = (p: Pair) => (/sgPerRound|sg[A-Z]/.test(p.metric) && p.clubhouse == null && p.production != null ? 'MIN_SG_ROUNDS floor' : null);

describe('Team stats against the Fairway Team stats page, same rounds', () => {
  it('each window and the whole career: scoring, greens, scrambling, putts, birdies, strokes gained and the rounds counted', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const fwAll = await fairwayTeam(db, 't1');
    const pairs: Pair[] = [];
    pairs.push(...teamPairs(await clubhouseTeam(db, 't1', range(filterFor('last10'), '18')), fwAll, { scope: 'career18', rates: false, scoring: true, sg: false }));
    pairs.push(...teamPairs(await clubhouseTeam(db, 't1', range(filterFor('last10'), 'all')), fwAll, { scope: 'careerAll', rates: true, scoring: false, sg: false }));
    for (const f of [filterFor('last10'), filterFor('season'), filterFor('qualifiers'), { ...filterFor('season'), types: ['practice' as const] }, { ...filterFor('season'), holes: '9' as const }]) {
      const ids = await teamWindowRoundIds(db, 't1', f);
      const fw = await fairwayTeam(subsetDb(db, ids), 't1');
      // Nine-hole only: production's scoring average is of 18-hole rounds, so it has none; the rates and putts pool the same holes.
      pairs.push(...teamPairs(await clubhouseTeam(db, 't1', f), fw, { scope: `${f.window}/${f.types.join('+') || 'all'}/${f.holes}`, rates: true, scoring: f.holes === '18', sg: f.holes === '18' }));
    }
    expectParity(pairs, sgFloor);
    // The one-round player and the floor: production shows their strokes gained, Clubhouse waits for three rounds.
    expect(pairs.find((p) => p.metric === 'teamGrid.sgPerRound' && p.scope.endsWith(':pB'))).toMatchObject({ clubhouse: null, production: 1.1 });
  });

  it('the season starts on 1 August: 31 July is out of This season, 1 August is in, for both', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const ids = await teamWindowRoundIds(db, 't1', filterFor('season'));
    expect(ids).toContain('a-aug1');
    expect(ids).not.toContain('a-jul31');
  });

  it('test, unfinished and half-entered rounds count on neither side', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const ch = await clubhouseTeam(db, 't1', range(filterFor('last10'), 'all'));
    const fw = await fairwayTeam(db, 't1');
    const ids = await teamWindowRoundIds(db, 't1', range(filterFor('last10'), 'all'));
    for (const gone of ['c-test', 'c-live', 'c-partial']) expect(ids).not.toContain(gone);
    expect(ch.roundCount).toBe(fw.players.reduce((a, p) => a + p.rounds_played, 0));
  });

  it('birdies are holes one under par on both sides: an eagle is not a birdie (it used to be counted as one here)', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = build([{ id: 'e1', player: 'pA', date: '2026-10-01', eagle: true, seed: 0 }, { id: 'e2', player: 'pA', date: '2026-10-02', seed: 3 }], [{ id: 't1', players: ['pA'] }]);
    const ch = await clubhouseTeam(db, 't1', filterFor('season'));
    const fw = await fairwayTeam(db, 't1');
    const birdies = ch.figures.find((f) => f.key === 'birdies')!;
    expect(birdies.value).toBeCloseTo(fw.fundamentals.birdiesPerRound!, 9);
    expect(birdies.context).toBe('Eagles not counted');
    // Season bests' "Most birdies" counts the same holes.
    const most = ch.bests.find((b) => b.label === 'Most birdies');
    const cache = db.tables.golf_round_stats_cache!;
    expect(most?.value).toBe(String(Math.max(...cache.map((r) => r.birdies as number))));
  });

  it('a round with no putt recorded has no putts figure on either side (production writes 0; it used to read as a 0-putt round here)', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = build([{ id: 'n1', player: 'pA', date: '2026-10-01', noPutts: true, seed: 0 }, { id: 'n2', player: 'pA', date: '2026-10-02', seed: 3 }], [{ id: 't1', players: ['pA'] }]);
    const ch = await clubhouseTeam(db, 't1', filterFor('season'));
    const fw = await fairwayTeam(db, 't1');
    expect(ch.figures.find((f) => f.key === 'putts')!.value).toBeCloseTo(fw.fundamentals.puttsPerRound!, 9);
    const prof = (await clubhousePlayer(db, 't1', 'pA', filterFor('season')))!;
    const s = await fairwayDetail(db, 'pA', holeRoundIds(db, prof));
    expect(prof.comparisons.find((c) => c.label === 'Putts per round')!.you).toBeCloseTo(s.puttsPerRound!, 2);
    expect(prof.comparisons.find((c) => c.label === '3-putts per round')!.you).toBeCloseTo(s.threePuttsPerRound!, 2);
    expect(prof.rounds.find((r) => r.id === 'n1')!.putts).toBeNull();
  });

  it('by design, a round posted as a total only counts in Clubhouse scoring (Q-123) and in no hole figure; production counts it nowhere', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture([{ id: 'c-total', player: 'pC', date: '2026-10-13', type: 'qualifier', totalOnly: 70 }]);
    const ch = await clubhouseTeam(db, 't1', range(filterFor('last10'), '18'));
    const fw = await fairwayTeam(db, 't1');
    const pairs = teamPairs(ch, fw, { scope: 'career18', rates: false, scoring: true, sg: false });
    const differs = (p: Pair) => (p.metric.endsWith('scoringAvg') && (p.scope === 'career18' || p.scope.endsWith(':pC')) ? 'Q-123: total-only rounds are scores' : null);
    expectParity(pairs, differs);
    expect(pairs.filter((p) => differs(p)).every((p) => !sameOnScreen(p))).toBe(true);
    // Hole figures are unmoved by it.
    const all = await clubhouseTeam(db, 't1', range(filterFor('last10'), 'all'));
    expectParity(teamPairs(all, fw, { scope: 'careerAll', rates: true, scoring: false, sg: false }), (p) => (p.metric === 'team.holeRounds' ? null : null));
    expect(all.holeRoundCount).toBe(fw.players.reduce((a, p) => a + p.rounds_played, 0));
  });

  it('by design, with both lengths in, strokes gained is per 18 holes (a nine-hole round counts half); production averages per round of either length', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const ch = await clubhouseTeam(db, 't1', range(filterFor('last10'), 'all'));
    const fw = await fairwayTeam(db, 't1');
    const sg = teamPairs(ch, fw, { scope: 'careerAll', rates: false, scoring: false, sg: true }).find((p) => p.metric === 'team.sgPerRound')!;
    expect(sameOnScreen(sg)).toBe(false);
    // With 18-hole rounds only (the default) they agree.
    const ids = await teamWindowRoundIds(db, 't1', range(filterFor('last10'), '18'));
    const fw18 = await fairwayTeam(subsetDb(db, ids), 't1');
    expectParity(teamPairs(await clubhouseTeam(db, 't1', range(filterFor('last10'), '18')), fw18, { scope: 'career18', rates: true, scoring: true, sg: true }), sgFloor);
  });
});

describe('Player stats against the Fairway player page (getDetailedStats), same rounds', () => {
  it('every window and filter, each player: scoring, to par, best round, fairways, greens, putts, 3-putts, scrambling, sand, penalties, par 3/4/5, the score mix, putts per green, strokes gained', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    const db = teamFixture();
    const pairs: Pair[] = [];
    const filters: Array<[string, ChFilter]> = [
      ['last10', filterFor('last10')],
      ['season', filterFor('season')],
      ['qualifiers', filterFor('qualifiers')],
      ['practice', { ...filterFor('season'), types: ['practice'] }],
      ['career18', range(filterFor('last10'), '18')],
      ['nine', { ...filterFor('season'), holes: '9' }],
    ];
    for (const pid of ['pA', 'pB', 'pC']) {
      for (const [name, f] of filters) {
        const prof = await clubhousePlayer(db, 't1', pid, f);
        if (!prof?.win.holeRounds) continue;
        const ids = holeRoundIds(db, prof);
        const s = await fairwayDetail(db, pid, ids);
        const fw = await fairwayTeam(subsetDb(db, ids), 't1');
        const out = playerPairs(prof, s, `${name}:${pid}`, fw.players.find((p) => p.id === pid));
        // Nine holes only: production's scoring average, to par and best round are of 18-hole rounds (none here), and its
        // per-round counts divide by rounds of any length; Clubhouse states them per 18 holes (perEighteen), by design.
        pairs.push(...(name === 'nine' ? out.filter((p) => !/scoringAvg|toPar|bestRound|birdiesPerRound|parsPerRound|bogeysPerRound/.test(p.metric)) : out));
      }
    }
    expectParity(pairs, sgFloor);
    expect(new Set(pairs.map((p) => p.scope.split(':')[1]))).toEqual(new Set(['pA', 'pB', 'pC']));
  });
});

// ---------------------------------------------------------------- real data (read-only dump, opt-in)

const DUMP = process.env.CH_STATS_REALDATA;
const NUMERIC = new Set([
  'strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting',
  'shot_distance', 'distance_to_hole_before', 'distance_to_hole_after', 'putt_distance_feet', 'distance_feet', 'distance_from_green_yards',
  'pga_tour_value', 'scale', 'driving_distance_avg', 'player_value', 'team_avg', 'handicap', 'handicap_index', 'yardage',
]);

function loadDump(dir: string): EvalDb {
  const read = (t: string): Row[] =>
    (JSON.parse(readFileSync(join(dir, `${t}.json`), 'utf8')) as Row[]).map((r) => {
      const out: Row = {};
      for (const [k, v] of Object.entries(r)) out[k] = NUMERIC.has(k) && typeof v === 'string' ? Number(v) : v;
      return out;
    });
  const tables: Record<string, Row[]> = {};
  for (const t of ['golf_teams', 'golf_team_members', 'golf_players', 'golf_rounds', 'golf_round_stats_cache', 'golf_holes', 'golf_shots', 'putt_details', 'approach_miss_details', 'golf_pga_standards', 'golf_player_standing']) {
    tables[t] = read(t);
  }
  for (const t of ['golf_patterns_v2', 'golf_player_focus_areas', 'golf_goals', 'golf_team_coach_staff', 'golf_coaches']) tables[t] = [];
  const scale = new Map(read('sg_scale').map((r) => [r.player_id, r.scale]));
  return { tables, rpc: { sg_scale_for_player: (a) => scale.get(a.p_player_id) ?? 1 } };
}

interface Tally {
  compared: number;
  mismatch: number;
  oneSided: number;
  maxAbs: number;
  examples: Array<{ scope: string; clubhouse: number | null; production: number | null; diff: number | null }>;
}

function tally(pairs: Pair[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const p of pairs) {
    const t = (out[p.metric] ??= { compared: 0, mismatch: 0, oneSided: 0, maxAbs: 0, examples: [] });
    if (p.clubhouse == null && p.production == null) continue;
    t.compared++;
    // CH_STATS_REALDATA_STRICT: production's own rounding counts as a difference (what its screen shows after rounding twice).
    if (sameOnScreen(process.env.CH_STATS_REALDATA_STRICT ? { ...p, tol: 0 } : p)) continue;
    const diff = p.clubhouse != null && p.production != null ? p.clubhouse - p.production : null;
    if (diff == null) t.oneSided++;
    else {
      t.mismatch++;
      t.maxAbs = Math.max(t.maxAbs, Math.abs(diff));
    }
    t.examples.push({ scope: p.scope, clubhouse: p.clubhouse, production: p.production, diff });
  }
  for (const t of Object.values(out)) t.examples = t.examples.sort((a, b) => Math.abs(b.diff ?? 999) - Math.abs(a.diff ?? 999));
  return out;
}

describe.runIf(!!DUMP)('real data: every team and player, both pipelines (read-only dump)', () => {
  it('pairs every metric and writes the tally', { timeout: 1_800_000 }, async () => {
    const db = loadDump(DUMP!);
    const members = db.tables.golf_team_members!.filter((m) => m.status === 'active');
    const teams = [...new Set(members.map((m) => m.team_id as string))];
    const pairs: Pair[] = [];
    const only = process.env.CH_STATS_REALDATA_ONLY; // 'team' | 'player'
    for (const teamId of teams) {
      if (only !== 'player') {
        const fwAll = await fairwayTeam(db, teamId);
        // Equalized: every round of the career, as the Fairway page reads them.
        pairs.push(...teamPairs(await clubhouseTeam(db, teamId, range(filterFor('last10'), '18')), fwAll, { scope: `career18:${teamId}`, rates: false, scoring: true, sg: false }));
        pairs.push(...teamPairs(await clubhouseTeam(db, teamId, range(filterFor('last10'), 'all')), fwAll, { scope: `careerAll:${teamId}`, rates: true, scoring: false, sg: true }));
        // Clubhouse's own windows, against the Fairway page over exactly the rounds each window counts.
        for (const w of ['last10', 'season'] as const) {
          const ch = await clubhouseTeam(db, teamId, filterFor(w));
          const windowIds = await teamWindowRoundIds(db, teamId, filterFor(w));
          const fw = await fairwayTeam(subsetDb(db, windowIds), teamId);
          pairs.push(...teamPairs(ch, fw, { scope: `${w}:${teamId}`, rates: true, scoring: true, sg: true }));
        }
      }
      if (only !== 'team') {
        for (const m of members.filter((x) => x.team_id === teamId)) {
          const pid = m.player_id as string;
          for (const [name, f] of [['last10', filterFor('last10')], ['season', filterFor('season')], ['career18', range(filterFor('last10'), '18')]] as const) {
            const prof = await clubhousePlayer(db, teamId, pid, f);
            if (!prof || !prof.win.holeRounds) continue;
            const ids = holeRoundIds(db, prof);
            const s = await fairwayDetail(db, pid, ids);
            const fw = await fairwayTeam(subsetDb(db, ids), teamId);
            pairs.push(...playerPairs(prof, s, `${name}:${teamId}:${pid}`, fw.players.find((p) => p.id === pid)));
          }
          // The Standing strip is career-wide and both lengths.
          const career = await clubhousePlayer(db, teamId, pid, range(filterFor('last10'), 'all'));
          if (career?.win.rounds) {
            const standing = new Map(db.tables.golf_player_standing!.filter((r) => r.player_id === pid && r.player_value != null).map((r) => [r.metric_id as string, r.player_value as number]));
            pairs.push(...standingPairs(career, standing, `careerAll:${teamId}:${pid}`));
          }
        }
      }
    }
    const out = process.env.CH_STATS_REALDATA_OUT ?? join(DUMP!, '..', 'tally.json');
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), teams: teams.length, pairs: pairs.length, tally: tally(pairs) }, null, 2));
    expect(pairs.length).toBeGreaterThan(0);
  });
});
