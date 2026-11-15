/**
 * Runs Clubhouse's Stats loaders and production's (Fairway's) stats code over the SAME rows, through the evaluating fake
 * (`supabase-eval-fake.ts`), and pairs their figures metric by metric. Used by stats-production-parity.test.ts (fixtures,
 * always) and by its real-data pass (a read-only dump, only when CH_STATS_REALDATA names one).
 *
 * Production's side:
 *   - Team: the figures the Fairway Team stats page (`dashboard/stats/team/page.tsx`, the props it handed `TeamStatsBoard`, and
 *     `buildTeamBoardViewModel`'s pooled figures) computed for each fixture here. That page was retired with Fairway
 *     (2026-11-14); its output for every fixture was recorded from the page itself the same day, before it was deleted, and
 *     is read back from `fixtures/stats-fairway-team-oracle.json`. A changed fixture has no oracle any more and fails loudly.
 *   - Player: `getDetailedStats` (the shot-level calculator behind the player stats) on the round ids Clubhouse read.
 *
 * The caller's test file registers the mocks (auth, the server and admin clients, the page's unrelated reads); this file
 * only drives them through `parityState`.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { SgPerRound } from '@/lib/golf/countable-round-stats';
import type { EvalDb, Row } from './supabase-eval-fake';
import { parityState } from './parity-state';
import { loadTeamStats, type ChTeamStats } from '../data/stats-team';
import { loadPlayerProfile, type ChPlayerProfile } from '../data/stats-player';
import type { ChFilter } from '../data/stats-filter';
import { groupByPlayer, loadSeasonRounds } from '../data/season';
import { loadSince, roundsInFilter } from '../data/stats-common';

// ---------- the database ----------

/** Restrict a database to some rounds (and their holes, cache rows, shots and shot details): production's code then reads exactly that set. */
export function subsetDb(db: EvalDb, roundIds: Iterable<string>): EvalDb {
  const ids = new Set(roundIds);
  const t = db.tables;
  const shots = (t.golf_shots ?? []).filter((s) => ids.has(s.round_id as string));
  const shotIds = new Set(shots.map((s) => s.id));
  return {
    rpc: db.rpc,
    tables: {
      ...t,
      golf_rounds: (t.golf_rounds ?? []).filter((r) => ids.has(r.id as string)),
      golf_round_stats_cache: (t.golf_round_stats_cache ?? []).filter((r) => ids.has(r.round_id as string)),
      golf_holes: (t.golf_holes ?? []).filter((r) => ids.has(r.round_id as string)),
      golf_shots: shots,
      putt_details: (t.putt_details ?? []).filter((r) => shotIds.has(r.shot_id)),
      approach_miss_details: (t.approach_miss_details ?? []).filter((r) => shotIds.has(r.shot_id)),
    },
  };
}

// ---------- production (Fairway, frozen) ----------

/** One player's row as the Fairway Team stats page computed it (the fields the pairs read). */
export interface TeamPlayerStats {
  id: string;
  rounds_played: number;
  rounds_played_18: number;
  scoring_average_18: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  putts_per_round: number | null;
  scrambling_pct: number | null;
  sg_countable?: SgPerRound | null;
}

export interface FairwayTeam {
  players: TeamPlayerStats[];
  /** Round-weighted 18-hole scoring (the board's "Team scoring" KPI, unformatted). */
  teamScoring18: number | null;
  teamSg: number | null;
  fundamentals: { fairwayPct: number | null; girPct: number | null; scramblingPct: number | null; puttsPerRound: number | null; birdiesPerRound: number | null };
}

const ORACLE = join(__dirname, 'fixtures', 'stats-fairway-team-oracle.json');

/** The fixture a figure was recorded for: the team, the (faked) clock and every row. */
function oracleKey(db: EvalDb, teamId: string): string {
  return createHash('sha256').update(JSON.stringify([teamId, Date.now(), db.tables])).digest('hex').slice(0, 16);
}

/** What the Fairway Team stats page computed over `db` for `teamId`: each player's row and the team's pooled figures. */
export async function fairwayTeam(db: EvalDb, teamId: string): Promise<FairwayTeam> {
  const key = oracleKey(db, teamId);
  const hit = (JSON.parse(readFileSync(ORACLE, 'utf8')) as Record<string, FairwayTeam>)[key];
  if (!hit) {
    throw new Error(
      `parity: no recorded Fairway Team stats figures for this fixture (${key}). The page was retired on 2026-11-14 and its ` +
        'figures were recorded for the fixtures that existed then; a new or changed fixture has no production oracle.',
    );
  }
  return hit;
}

/** The shot-level calculator behind the Fairway player page, on exactly these rounds (what the Fairway page reads when a coach scopes it to them). */
export async function fairwayDetail(db: EvalDb, playerId: string, roundIds: string[]): Promise<GolfStats> {
  parityState.db = db;
  const { getDetailedStats } = await import('@/app/golf/actions/stats-data');
  const { runWithStatsActionContext } = await import('@/lib/golf/stats-action-context');
  const { evalClient } = await import('./supabase-eval-fake');
  const supabase = evalClient({ get current() { return parityState.db; } }) as never;
  return runWithStatsActionContext(
    { supabase, user: { id: 'parity-viewer' } as never, requestedPlayerId: playerId, authorization: { allowed: true } as never },
    () => getDetailedStats(playerId, roundIds),
  );
}

// ---------- Clubhouse ----------

export async function clubhouseTeam(db: EvalDb, teamId: string, filter: ChFilter): Promise<ChTeamStats> {
  parityState.db = db;
  return loadTeamStats({ teamId, window: filter.window, filter });
}

export async function clubhousePlayer(db: EvalDb, teamId: string, playerId: string, filter: ChFilter): Promise<ChPlayerProfile | null> {
  parityState.db = db;
  return loadPlayerProfile({ viewer: 'coach', teamId, playerId, window: filter.window, filter });
}

/** The ids of a player's rounds in a profile's window that have their holes (the ones the shot-level reads are given), newest first. */
export function holeRoundIds(db: EvalDb, profile: ChPlayerProfile): string[] {
  const byId = new Map((db.tables.golf_rounds ?? []).map((r) => [r.id as string, r] as const));
  return profile.rounds
    .map((r) => byId.get(r.id))
    .filter((r): r is Row => !!r && (r.front_nine != null ? 9 : 0) + (r.back_nine != null ? 9 : 0) === ((r.holes_played as number | null) ?? 18))
    .map((r) => r.id as string)
    .slice(0, 100);
}

/**
 * The rounds a Clubhouse team window counts (every active player's window), selected by the loader's own functions over the
 * loader's own read: what the Fairway page is then given, so both count the same rounds.
 */
export async function teamWindowRoundIds(db: EvalDb, teamId: string, filter: ChFilter): Promise<string[]> {
  parityState.db = db;
  const { evalClient } = await import('./supabase-eval-fake');
  const supabase = evalClient({ get current() { return parityState.db; } }) as never;
  const players = (db.tables.golf_team_members ?? []).filter((m) => m.team_id === teamId && m.status === 'active').map((m) => m.player_id as string);
  const { rounds } = await loadSeasonRounds(supabase, players, { surface: 'parity', since: loadSince(filter) });
  const byPlayer = groupByPlayer(rounds);
  return players.flatMap((p) => roundsInFilter(byPlayer.get(p) ?? [], filter).map((r) => r.id));
}

// ---------- pairing ----------

export interface Pair {
  metric: string;
  scope: string;
  clubhouse: number | null;
  production: number | null;
  /** Digits the Clubhouse screen shows the figure with; equal at this precision is a match. */
  digits: number;
  /**
   * Half the unit production already rounded its value to (the calculator rounds rates to 0.1 and averages to 0.01): a
   * difference within it is production's rounding, not a different figure.
   */
  tol: number;
}

export function pair(metric: string, scope: string, clubhouse: number | null | undefined, production: number | null | undefined, digits: number, tol = 0): Pair {
  const fin = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { metric, scope, clubhouse: fin(clubhouse), production: fin(production), digits, tol };
}

/** Same on screen: both missing, or both present and equal at the shown precision. */
export function sameOnScreen(p: Pair): boolean {
  if (p.clubhouse == null || p.production == null) return p.clubhouse == null && p.production == null;
  const f = 10 ** p.digits;
  // Rounded the way the screens round (half away from zero), with a hair of tolerance for float noise.
  const r = (v: number) => Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9);
  return r(p.clubhouse) === r(p.production) || Math.abs(p.clubhouse - p.production) <= p.tol + 1e-9;
}

/** Team page pairs: the team's figures, and each player's grid row against Fairway's row for them. */
export function teamPairs(ch: ChTeamStats, fw: FairwayTeam, opts: { scope: string; rates: boolean; scoring: boolean; sg: boolean }): Pair[] {
  const fig = (k: string) => ch.figures.find((f) => f.key === k)?.value ?? null;
  const out: Pair[] = [];
  if (opts.scoring) out.push(pair('team.scoringAvg', opts.scope, fig('score'), fw.teamScoring18, 1));
  if (opts.rates) {
    out.push(pair('team.girPct', opts.scope, fig('gir'), fw.fundamentals.girPct, 0));
    out.push(pair('team.scramblingPct', opts.scope, fig('scramble'), fw.fundamentals.scramblingPct, 0));
    out.push(pair('team.puttsPerRound', opts.scope, fig('putts'), fw.fundamentals.puttsPerRound, 1));
    out.push(pair('team.birdiesPerRound', opts.scope, fig('birdies'), fw.fundamentals.birdiesPerRound, 1));
  }
  if (opts.sg) out.push(pair('team.sgPerRound', opts.scope, fig('sg'), fw.teamSg, 1));
  // Rounds with their holes: production counts no round posted as a total only (Clubhouse's roundCount does, Q-123).
  if (opts.rates) out.push(pair('team.holeRounds', opts.scope, ch.holeRoundCount ?? ch.roundCount, fw.players.reduce((a, p) => a + p.rounds_played, 0), 0));
  const fwById = new Map(fw.players.map((p) => [p.id, p]));
  for (const g of ch.grid) {
    const p = fwById.get(g.id);
    if (!p) continue;
    if (opts.scoring) out.push(pair('teamGrid.scoringAvg', `${opts.scope}:${g.id}`, g.avg, p.scoring_average_18, 1));
    if (opts.sg) out.push(pair('teamGrid.sgPerRound', `${opts.scope}:${g.id}`, g.total, p.sg_countable?.total ?? null, 1));
  }
  return out;
}

/** Calculator rounding (golf-stats-calculator-shots.ts): `safePercent` to 0.1, `safeAverage` and the per-18 counts to 0.01. */
const PCT = 0.05;
const AVG = 0.005;

/**
 * Player page pairs: what the Clubhouse profile shows against production on the same rounds. The calculator (getDetailedStats)
 * is the Fairway player page's source for the scoring and hole figures; strokes gained on production is the stored per-round
 * value (the Team stats page's `sg_countable` and the Standing strip), never the calculator's (no production view shows
 * `sg*PerRound`), so strokes gained is paired with the Team stats page's row over the same rounds.
 */
export function playerPairs(prof: ChPlayerProfile, s: GolfStats, scope: string, fwRow?: TeamPlayerStats): Pair[] {
  const cmp = (label: string) => prof.comparisons.find((c) => c.label === label)?.you ?? null;
  const par = (p: 3 | 4 | 5) => {
    const d = s.scoringByPar?.[`par${p}` as const];
    return d && d.total > 0 && d.avgToPar != null ? p + d.avgToPar : null;
  };
  const shown = prof.stats;
  const out = [
    pair('player.rounds', scope, prof.win.holeRounds, s.roundsPlayed, 0),
    pair('player.scoringAvg', scope, prof.win.avg, s.scoringAverage18, 1, AVG),
    pair('player.toPar', scope, prof.win.toPar, s.avgScoreToPar, 1, AVG),
    pair('player.bestRound', scope, prof.extra.bests.score?.value ?? null, s.bestRound18, 0),
    pair('player.gameDetail.scoringAvg', scope, shown?.scoringAverage ?? null, s.scoringAverage18, 1, AVG),
    pair('player.fairwayPct', scope, cmp('Fairways hit'), s.fairwayPercentage, 0, PCT),
    pair('player.girPct', scope, cmp('Greens in regulation'), s.girPercentage, 0, PCT),
    pair('player.puttsPerRound', scope, cmp('Putts per round'), s.puttsPerRound, 1, AVG),
    pair('player.threePuttsPerRound', scope, cmp('3-putts per round'), s.threePuttsPerRound, 2, AVG),
    pair('player.scramblingPct', scope, cmp('Scrambling'), s.scramblingPercentage, 0, PCT),
    pair('player.sandSavePct', scope, cmp('Sand saves'), s.sandSavePercentage, 0, PCT),
    pair('player.penaltiesPerRound', scope, cmp('Penalty strokes'), s.penaltiesPerRound, 1, AVG),
    pair('player.par3', scope, cmp('Par 3 scoring'), par(3), 2),
    pair('player.par4', scope, cmp('Par 4 scoring'), par(4), 2),
    pair('player.par5', scope, cmp('Par 5 scoring'), par(5), 2),
    pair('player.birdiesPerRound', scope, shown?.birdiesPerRound ?? null, s.birdiesPerRound, 1, AVG),
    pair('player.parsPerRound', scope, shown?.parsPerRound ?? null, s.parsPerRound, 1, AVG),
    pair('player.bogeysPerRound', scope, shown?.bogeysPerRound ?? null, s.bogeysPerRound, 1, AVG),
    pair('player.puttsPerGir', scope, shown?.puttsPerGir ?? null, s.puttsPerGir, 2),
  ];
  if (fwRow) {
    out.push(pair('player.fairwayPct.vsTeamPage', scope, cmp('Fairways hit'), fwRow.fairway_pct, 0));
    out.push(pair('player.girPct.vsTeamPage', scope, cmp('Greens in regulation'), fwRow.gir_pct, 0));
    out.push(pair('player.puttsPerRound.vsTeamPage', scope, cmp('Putts per round'), fwRow.putts_per_round, 1));
    out.push(pair('player.scramblingPct.vsTeamPage', scope, cmp('Scrambling'), fwRow.scrambling_pct, 0));
    const sg = fwRow.sg_countable;
    out.push(pair('player.sgPerRound.vsTeamPage', scope, prof.win.sgPerRound, sg?.total ?? null, 1));
    out.push(pair('player.sgTee.vsTeamPage', scope, prof.win.sgLegs.tee, sg?.offTee ?? null, 1));
    out.push(pair('player.sgApproach.vsTeamPage', scope, prof.win.sgLegs.approach, sg?.approach ?? null, 1));
    out.push(pair('player.sgAround.vsTeamPage', scope, prof.win.sgLegs.around, sg?.aroundGreen ?? null, 1));
    out.push(pair('player.sgPutting.vsTeamPage', scope, prof.win.sgLegs.putting, sg?.putting ?? null, 1));
  }
  return out;
}

/**
 * The Standing strip production shows on the Fairway player page (golf_player_standing, the nightly career cache), against the
 * Clubhouse profile over the whole career and both lengths. Its known gaps today are the HELD OD-01 chain's (test, partial and
 * implausible rounds in the cache) and the pre-NUM-24 pressure gap.
 */
export function standingPairs(prof: ChPlayerProfile, standing: Map<string, number>, scope: string): Pair[] {
  const cmp = (label: string) => prof.comparisons.find((c) => c.label === label)?.you ?? null;
  const st = (m: string) => standing.get(m) ?? null;
  return [
    pair('standing.sg_total', scope, prof.win.sgPerRound, st('sg_total'), 1),
    pair('standing.sg_ott', scope, prof.win.sgLegs.tee, st('sg_ott'), 1),
    pair('standing.sg_approach', scope, prof.win.sgLegs.approach, st('sg_approach'), 1),
    pair('standing.sg_around_green', scope, prof.win.sgLegs.around, st('sg_around_green'), 1),
    pair('standing.sg_putting', scope, prof.win.sgLegs.putting, st('sg_putting'), 1),
    pair('standing.gir_pct', scope, cmp('Greens in regulation'), st('gir_pct'), 0),
    pair('standing.scoring_par_3', scope, cmp('Par 3 scoring'), st('scoring_par_3'), 2),
    pair('standing.scoring_par_4', scope, cmp('Par 4 scoring'), st('scoring_par_4'), 2),
    pair('standing.scoring_par_5', scope, cmp('Par 5 scoring'), st('scoring_par_5'), 2),
    pair('standing.scrambling_pct_sand', scope, cmp('Sand saves'), st('scrambling_pct_sand'), 0),
    pair('standing.penalty_rate_per_round', scope, cmp('Penalty strokes'), st('penalty_rate_per_round'), 1),
    pair('standing.big_number_rate', scope, cmp('Big numbers'), st('big_number_rate'), 1),
    pair('standing.practice_tournament_delta', scope, cmp('Pressure gap'), st('practice_tournament_delta'), 1),
    pair('standing.opening_hole_delta', scope, cmp('Opening hole'), st('opening_hole_delta'), 1),
    pair('standing.approach_proximity_50_125ft', scope, cmp('Proximity 50–125 yd'), st('approach_proximity_50_125ft'), 0),
    pair('standing.approach_proximity_125_175ft', scope, cmp('Proximity 125–175 yd'), st('approach_proximity_125_175ft'), 0),
    pair('standing.approach_proximity_175_plus_ft', scope, cmp('Proximity 175+ yd'), st('approach_proximity_175_plus_ft'), 0),
    pair('standing.putts_made_3_5ft_pct', scope, cmp('Make 3–5 ft'), st('putts_made_3_5ft_pct'), 0),
    pair('standing.putts_made_5_10ft_pct', scope, cmp('Make 5–10 ft'), st('putts_made_5_10ft_pct'), 0),
    pair('standing.putts_made_10_15ft_pct', scope, cmp('Make 10–15 ft'), st('putts_made_10_15ft_pct'), 0),
    pair('standing.putts_made_15_25ft_pct', scope, cmp('Make 15–25 ft'), st('putts_made_15_25ft_pct'), 0),
    pair('standing.putts_made_25_plus_ft_pct', scope, cmp('Make 25+ ft'), st('putts_made_25_plus_ft_pct'), 0),
  ];
}
