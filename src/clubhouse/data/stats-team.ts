import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { sgBaseline, type ChSgTour } from '../lib/sg';
import { fullName, groupByPlayer, loadSeasonRounds, mean, MIN_SG_ROUNDS, shortDate, type ChRound } from './season';
import {
  bandPutts,
  earlierInFilter,
  filterOptions,
  loadTourBenchmarks,
  loadPutts,
  loadRoundCache,
  loadSince,
  previousInFilter,
  rate,
  roundsInFilter,
  seasonOnly,
  sgChange,
  tourForGender,
  weekLabel,
  weekOf,
  type ChRoundCache,
  type ChSgChange,
  type ChWindow,
} from './stats-common';
import { holeCoverage, holeRounds } from './round-scope';
import { effectiveWindow, filterFor, hasPrevious, type ChFilter, type ChFilterOptions } from './stats-filter';
import { effectiveCount, effectiveRounds, summarizeWindow, weightedMean } from './stats-weight';

/**
 * Team Stats (Clubhouse). Trends and strokes gained first; the owner removed
 * the team stat sheet. Every figure states its window and sample, and a
 * failed read is flagged per section, never shown as zero.
 */

export const LEGS = ['Off the tee', 'Approach', 'Around green', 'Putting'] as const;
export type ChLeg = (typeof LEGS)[number];

export interface ChFigure {
  label: string;
  value: number | null;
  unit: '' | '%';
  digits: number;
  /** Change against the previous window; null when there is no previous window. */
  delta: number | null;
  /** Lower is better (scoring, putts). Drives the chip colour. */
  lowerIsBetter: boolean;
  context: string;
  /** Shown with a sign and green or amber (strokes gained). */
  signed?: boolean;
  /** A second line under the context: what the figure is measured against. */
  note?: string;
  /** `empty`: no value (strokes gained needs rounds with shots). `no-comparison`: a value, with no earlier rounds to set it against. Drives the catalog states. */
  state?: 'empty' | 'no-comparison';
}

export interface ChTeamStats {
  teamName: string;
  window: ChWindow;
  /** The round filter in force (the address's), and what its sheet can list: every loaded round of the active players, of either length. */
  filter: ChFilter;
  filterOptions: ChFilterOptions;
  activeCount: number;
  roundCount: number;
  /**
   * Of the window's rounds, how many have their holes scored: greens, putts, scrambling, birdies and strokes gained read these, not the
   * rounds posted as a total only (Q-123). Fewer than `roundCount` and each of those cards says "Hole stats from 8 of 10 rounds". Absent: every round has its holes.
   */
  holeRoundCount?: number;
  /** The window's rounds in whole rounds (a nine-hole round is half), which the early-read note counts. */
  roundsEffective: number;
  figures: ChFigure[];
  weeks: string[];
  /** The phone's scoring trend (m-stats.jsx: "Team avg · 10 rounds"): the team's average on each of its last ten round days, oldest first. */
  days: Array<{ label: string; score: number | null }>;
  /** Weekly averages, and the window's own mean (strokes gained per round, scoring average), which is what the headline and the sort read. */
  team: { sg: Array<number | null>; score: Array<number | null>; sgMean: number | null; scoreMean: number | null };
  players: Array<{ id: string; name: string; first: string; sg: Array<number | null>; score: Array<number | null>; sgMean: number | null; scoreMean: number | null }>;
  legWeeks: Record<ChLeg, Array<number | null>>;
  grid: Array<{ id: string; name: string; rounds: number; legs: Array<number | null>; total: number | null; change: number | null; /** Scoring average over the window's rounds, per 18 holes (the phone's player list). */ avg: number | null }>;
  /** The team's strokes gained per round in each leg over the window, against the baseline; null with no strokes gained (the phone's leg bars). */
  legTotals: Array<number | null>;
  putting: { bands: Array<{ label: string; made: number; attempts: number; bench: number | null }>; putts: number } | null;
  bests: Array<{ label: string; playerId: string; name: string; value: string; meta: string; under?: boolean }>;
  /** What the strokes gained here is measured against; null when the team's own row didn't load. */
  tour: ChSgTour;
  /** The team's strokes gained a round against the previous window (the headline chip). */
  sgChange: ChSgChange;
  /** Rounds in the window with strokes gained (the headline's sample). */
  sgRounds: number;
  roundsError: boolean;
  cacheError: boolean;
  puttsError: boolean;
}

function sgLegs(r: ChRound): Array<number | null> {
  return [r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting];
}

export async function loadTeamStats(input: { teamId: string; window: ChWindow; filter?: ChFilter }): Promise<ChTeamStats> {
  const f = input.filter ?? filterFor(input.window);
  const supabase = await createClient();
  const [teamRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name, gender').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_team_members')
      .select('player:golf_players(id, first_name, last_name)')
      .eq('team_id', input.teamId)
      .eq('status', 'active'),
  ]);
  if (teamRes.error) chLogServer('stats', 'team', teamRes.error, 'teams');
  if (membersRes.error) chLogServer('stats', 'members', membersRes.error, 'teams');

  type P = { id: string; first_name: string | null; last_name: string | null };
  const players = ((membersRes.data ?? []) as Array<{ player: P | null }>).map((m) => m.player).filter((p): p is P => !!p);
  // CH-4210: without the team's row its tour is unknown, so no benchmark or baseline is claimed
  // (a women's team must never be graded against the men's Tour values; Q-88: the Tour is the only benchmark).
  const tour = teamRes.error ? null : tourForGender(teamRes.data?.gender);
  const benchPromise = tour ? loadTourBenchmarks(supabase, tour, 'stats') : Promise.resolve(new Map<string, number>());

  const season = players.length
    ? await loadSeasonRounds(supabase, players.map((p) => p.id), { surface: 'stats', since: loadSince(f) })
    : { rounds: [], error: !!membersRes.error };
  const byPlayer = groupByPlayer(season.rounds);

  const windowRounds: ChRound[] = [];
  const prevRounds: ChRound[] = [];
  // Q-112: a change compares the same players: the window's rounds of those who also have a previous ten, against that ten.
  const windowPaired: ChRound[] = [];
  let hasPrev = hasPrevious(f);
  for (const p of players) {
    const list = byPlayer.get(p.id) ?? [];
    const cur = roundsInFilter(list, f);
    windowRounds.push(...cur);
    const prev = previousInFilter(list, f);
    if (prev && prev.length) {
      prevRounds.push(...prev);
      windowPaired.push(...cur);
    }
  }
  if (!prevRounds.length) hasPrev = false;

  // Q-123: a round posted as a total only is a score and nothing else; every hole-level figure reads the rounds with their holes.
  const holeWindow = holeRounds(windowRounds);
  const holePrev = holeRounds(prevRounds);
  const holePaired = holeRounds(windowPaired);

  // One cache read serves the window, the previous window and the season bests (either length, and earlier ones when Last 10 or a range
  // reaches before the season): only the rounds with their holes, and only the ones a figure reads, so Last 10's wider read does not
  // pull a year of putts. The season's bests are 18-hole rounds (`seasonFull`).
  const seasonFull = season.rounds.filter((r) => (r.holes_played ?? 18) === 18);
  const seasonRounds = seasonOnly(season.rounds);
  const figureIds = [...new Set([...holeWindow, ...holePrev, ...holeRounds(seasonRounds)].map((r) => r.id))];
  const [cache, putts, bench] = await Promise.all([
    loadRoundCache(supabase, figureIds, 'stats'),
    // The window's putts for its bands, and the season's for its longest made putt.
    loadPutts(supabase, figureIds),
    benchPromise,
  ]);
  const rowsFor = (rs: ChRound[]) => rs.map((r) => cache.byRound.get(r.id)).filter((x): x is ChRoundCache => !!x);
  const cur = rowsFor(holeWindow);
  const prev = rowsFor(holePrev);
  const curPaired = rowsFor(holePaired);

  // Per-round figures are per 18 holes (a nine-hole round counts as half a round); the rates pool the holes and shots.
  const cacheNum = (r: ChRound, key: keyof ChRoundCache): number | null => {
    const v = cache.byRound.get(r.id)?.[key];
    return typeof v === 'number' ? v : null;
  };
  const birdiesOf = (r: ChRound): number | null => {
    const c = cache.byRound.get(r.id);
    return c && c.birdies != null ? c.birdies + (c.eagles ?? 0) : null;
  };
  // Scoring counts every round (a total-only one included); greens, putts, scrambling, birdies and strokes gained the rounds with their holes.
  const scoring = weightedMean(windowRounds, (r) => r.total_score);
  const prevScoring = hasPrev ? weightedMean(prevRounds, (r) => r.total_score) : null;
  const gir = rate(cur, 'greens_hit', 'greens_total');
  const puttsPer = weightedMean(holeWindow, (r) => cacheNum(r, 'total_putts'));
  const scramble = rate(cur, 'scrambles_converted', 'scramble_attempts');
  const birdies = weightedMean(holeWindow, birdiesOf);
  const d = (a: number | null, b: number | null) => (hasPrev && a != null && b != null ? a - b : null);
  const benchGir = bench.get('gir_pct');
  const count = (n: number) => `${n} ${n === 1 ? 'round' : 'rounds'}`;
  const sample = count(windowRounds.length);
  // The hole-level cards rest on the rounds with their holes: their own count, and when it is fewer than the window's, a line saying so.
  const holeSample = count(holeWindow.length);
  const coverage = holeCoverage(holeWindow.length, windowRounds.length) ?? undefined;
  // Strokes gained per round: the window's mean over its rounds with strokes gained, against the previous 10 when there is one.
  const sgNow = holeWindow.map((r) => r.strokes_gained_total).filter((v): v is number => v != null);
  const sgTotal = weightedMean(holeWindow, (r) => r.strokes_gained_total);
  const earlier = players.reduce((a, p) => a + earlierInFilter(byPlayer.get(p.id) ?? [], f), 0);
  // The previous stretch needs three whole rounds with shots, as the window's own figures do.
  const sgPrev = effectiveCount(holePrev, (r) => r.strokes_gained_total) >= MIN_SG_ROUNDS ? weightedMean(holePrev, (r) => r.strokes_gained_total) : null;
  // The reason (or "vs. previous 10") reads the whole window; the number compares the same players (Q-112).
  const sgBase = sgChange(sgTotal, sgPrev, effectiveWindow(f), earlier);
  const sgPaired = weightedMean(holePaired, (r) => r.strokes_gained_total);
  const sgDelta = sgBase.delta != null ? { ...sgBase, delta: sgPaired != null && sgPrev != null ? sgPaired - sgPrev : null } : sgBase;
  const baseline = sgBaseline(tour);
  const figures: ChFigure[] = [
    {
      label: 'Team SG per round',
      value: sgTotal,
      unit: '',
      digits: 1,
      signed: true,
      delta: sgDelta.delta,
      lowerIsBetter: false,
      context: sgDelta.context || (sgNow.length ? `${sgNow.length} ${sgNow.length === 1 ? 'round' : 'rounds'} with shots` : 'Needs rounds with shots'),
      state: sgTotal == null ? 'empty' : sgDelta.delta == null && sgDelta.context ? 'no-comparison' : undefined,
      // Always drawn, so the card is as tall as its loading skeleton (CH-4401).
      note: `${baseline.vs}${sgNow.length && sgDelta.context ? ` · ${sgNow.length} ${sgNow.length === 1 ? 'round' : 'rounds'} with shots` : ''}`,
    },
    { label: 'Scoring average', value: scoring, unit: '', digits: 1, delta: d(weightedMean(windowPaired, (r) => r.total_score), prevScoring), lowerIsBetter: true, context: hasPrev ? 'vs. previous 10' : sample },
    // CH-4209: without Tour benchmarks, greens read against the sample instead of "Tour averages".
    { label: 'Greens in regulation', value: gir, unit: '%', digits: 0, delta: d(rate(curPaired, 'greens_hit', 'greens_total'), rate(prev, 'greens_hit', 'greens_total')), lowerIsBetter: false, context: benchGir != null ? `Tour averages ${Math.round(benchGir)}%` : holeSample, note: coverage },
    { label: 'Putts per round', value: puttsPer, unit: '', digits: 1, delta: d(weightedMean(holePaired, (r) => cacheNum(r, 'total_putts')), weightedMean(holePrev, (r) => cacheNum(r, 'total_putts'))), lowerIsBetter: true, context: hasPrev ? 'vs. previous 10' : holeSample, note: coverage },
    { label: 'Scrambling', value: scramble, unit: '%', digits: 0, delta: d(rate(curPaired, 'scrambles_converted', 'scramble_attempts'), rate(prev, 'scrambles_converted', 'scramble_attempts')), lowerIsBetter: false, context: hasPrev ? 'vs. previous 10' : holeSample, note: coverage },
    {
      label: 'Birdies per round',
      value: birdies,
      unit: '',
      digits: 1,
      delta: d(weightedMean(holePaired, birdiesOf), weightedMean(holePrev, birdiesOf)),
      lowerIsBetter: false,
      context: 'Birdies and eagles',
      note: coverage,
    },
  ];

  // Weekly trend: team and each player, strokes gained and scoring.
  const weekKeys = [...new Set(windowRounds.map((r) => weekOf(r.round_date)))].sort().slice(-10);
  const inWeek = (rs: ChRound[], wk: string) => rs.filter((r) => weekOf(r.round_date) === wk);
  const avgOf = (rs: ChRound[], pick: (r: ChRound) => number | null) => weightedMean(rs, pick);
  const playerSeries = players
    .map((p) => {
      const mine = roundsInFilter(byPlayer.get(p.id) ?? [], f);
      const mineHoles = holeRounds(mine);
      return {
        id: p.id,
        name: fullName(p),
        first: p.first_name || fullName(p),
        sg: weekKeys.map((wk) => avgOf(inWeek(mineHoles, wk), (r) => r.strokes_gained_total)),
        score: weekKeys.map((wk) => avgOf(inWeek(mine, wk), (r) => r.total_score)),
        // The window's own mean (what the list is sorted by), not the last week's: strokes gained needs three rounds, as in the grid.
        sgMean: effectiveCount(mineHoles, (r) => r.strokes_gained_total) >= MIN_SG_ROUNDS ? weightedMean(mineHoles, (r) => r.strokes_gained_total) : null,
        scoreMean: weightedMean(mine, (r) => r.total_score),
      };
    })
    .filter((s) => s.score.some((v) => v != null));
  const legWeeks = Object.fromEntries(
    LEGS.map((leg, i) => [leg, weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), (r) => sgLegs(r)[i] ?? null))]),
  ) as Record<ChLeg, Array<number | null>>;

  // Player x leg grid.
  const grid = players
    .map((p) => {
      const mine = roundsInFilter(byPlayer.get(p.id) ?? [], f);
      const mineHoles = holeRounds(mine);
      const s = summarizeWindow(mine);
      const legs = LEGS.map((_, i) => (effectiveCount(mineHoles, (r) => sgLegs(r)[i]) >= MIN_SG_ROUNDS ? weightedMean(mineHoles, (r) => sgLegs(r)[i]) : null));
      // Late half against early half, both per 18 holes, and needing four whole rounds with shots (a nine-hole round is half).
      const sgMine = mineHoles.filter((r) => r.strokes_gained_total != null).reverse();
      const half = Math.floor(sgMine.length / 2);
      const sgOf = (r: ChRound) => r.strokes_gained_total;
      const change = effectiveCount(sgMine, sgOf) >= 4 ? (weightedMean(sgMine.slice(sgMine.length - half), sgOf) ?? 0) - (weightedMean(sgMine.slice(0, half), sgOf) ?? 0) : null;
      return { id: p.id, name: fullName(p), rounds: mine.length, legs, total: s.sgPerRound, change, avg: s.avg };
    })
    .filter((g) => g.rounds > 0);

  // Putting make rate by distance.
  let putting: ChTeamStats['putting'] = null;
  const windowIds = new Set(holeWindow.map((r) => r.id));
  const windowPutts = putts.rows.filter((r) => windowIds.has(r.roundId));
  if (!putts.error && windowPutts.length) {
    putting = { bands: bandPutts(windowPutts, bench), putts: windowPutts.length };
  }

  // Season bests stay season-wide whatever the filter (and a custom range that reads earlier rounds): the section says so.
  const bests = seasonBests(seasonOnly(seasonFull), players, cache.byRound, putts.error ? null : { rows: putts.rows, rounds: seasonRounds });

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    window: f.window,
    filter: f,
    filterOptions: filterOptions(season.rounds, new Map(players.map((p) => [p.id, fullName(p)]))),
    activeCount: players.length,
    roundCount: windowRounds.length,
    holeRoundCount: holeWindow.length,
    roundsEffective: effectiveRounds(windowRounds),
    figures,
    weeks: weekKeys.map(weekLabel),
    days: [...new Set(windowRounds.map((r) => r.round_date))]
      .sort()
      .slice(-10)
      .map((d) => ({ label: shortDate(d), score: avgOf(windowRounds.filter((r) => r.round_date === d), (r) => r.total_score) })),
    team: {
      sg: weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), (r) => r.strokes_gained_total)),
      score: weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => r.total_score)),
      sgMean: sgTotal,
      scoreMean: scoring,
    },
    players: playerSeries,
    legWeeks,
    grid,
    legTotals: LEGS.map((_, i) => avgOf(holeWindow, (r) => sgLegs(r)[i] ?? null)),
    putting,
    bests,
    tour,
    sgChange: sgDelta,
    sgRounds: sgNow.length,
    roundsError: season.error || !!membersRes.error,
    cacheError: cache.error,
    puttsError: putts.error,
  };
}

function seasonBests(
  rounds: ChRound[],
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>,
  cache: Map<string, ChRoundCache>,
  putts: { rows: Array<{ roundId: string; feet: number; made: boolean }>; rounds: ChRound[] } | null,
): ChTeamStats['bests'] {
  const name = new Map(players.map((p) => [p.id, fullName(p)]));
  const out: ChTeamStats['bests'] = [];
  const meta = (r: ChRound) => [r.course_name, shortDate(r.round_date)].filter(Boolean).join(' · ');
  const valid = rounds.filter((r) => name.has(r.player_id));

  const low = [...valid].sort((a, b) => (a.total_score ?? 999) - (b.total_score ?? 999))[0];
  if (low?.total_score != null) {
    const tp = low.score_to_par;
    out.push({
      label: 'Low round',
      playerId: low.player_id,
      name: name.get(low.player_id)!,
      value: `${low.total_score}${tp != null ? ` (${tp === 0 ? 'E' : tp > 0 ? `+${tp}` : `−${Math.abs(tp)}`})` : ''}`,
      meta: meta(low),
      under: tp != null && tp < 0,
    });
  }
  const birdie = valid
    .map((r) => ({ r, n: (cache.get(r.id)?.birdies ?? 0) + (cache.get(r.id)?.eagles ?? 0), known: cache.has(r.id) }))
    .filter((x) => x.known)
    .sort((a, b) => b.n - a.n)[0];
  if (birdie && birdie.n > 0) {
    out.push({ label: 'Most birdies', playerId: birdie.r.player_id, name: name.get(birdie.r.player_id)!, value: String(birdie.n), meta: meta(birdie.r) });
  }
  const sg = valid.filter((r) => r.strokes_gained_total != null).sort((a, b) => b.strokes_gained_total! - a.strokes_gained_total!)[0];
  if (sg) {
    const v = sg.strokes_gained_total!;
    out.push({ label: 'Best SG round', playerId: sg.player_id, name: name.get(sg.player_id)!, value: `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`, meta: meta(sg) });
  }
  // Longest putt made, from shot-level putting data (any countable round this season).
  if (putts) {
    const roundById = new Map(putts.rounds.filter((r) => name.has(r.player_id)).map((r) => [r.id, r]));
    const top = putts.rows.filter((p) => p.made && roundById.has(p.roundId)).sort((a, b) => b.feet - a.feet)[0];
    const r = top ? roundById.get(top.roundId) : undefined;
    if (top && r) out.push({ label: 'Longest putt made', playerId: r.player_id, name: name.get(r.player_id)!, value: `${Math.round(top.feet)} ft`, meta: meta(r) });
  }
  // Most improved: first five rounds of the season against the latest five, at least ten rounds.
  let best: { id: string; change: number } | null = null;
  for (const [id, list] of groupByPlayer(valid)) {
    if (list.length < 10) continue;
    const newest = mean(list.slice(0, 5).map((r) => r.total_score as number));
    const oldest = mean(list.slice(-5).map((r) => r.total_score as number));
    if (newest == null || oldest == null) continue;
    const change = newest - oldest;
    if (change < 0 && (!best || change < best.change)) best = { id, change };
  }
  if (best) {
    out.push({ label: 'Most improved', playerId: best.id, name: name.get(best.id)!, value: `−${Math.abs(best.change).toFixed(1)}`, meta: 'Scoring avg, first five rounds to latest five' });
  }
  return out;
}
