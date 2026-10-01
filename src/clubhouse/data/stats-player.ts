import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getDetailedStats } from '@/app/golf/actions/stats-data';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { chLogServer } from '../lib/track-server';
import type { ChSgTour } from '../lib/sg';
import { classYearLabel, fullName, groupByPlayer, loadSeasonRounds, MIN_SG_ROUNDS, shortDate, summarizePlayer, type ChPlayerSeason, type ChRound } from './season';
import {
  bandPutts,
  earlierInFilter,
  filterOptions,
  loadPutts,
  loadRoundCache,
  loadSince,
  loadTourBenchmarks,
  previousInFilter,
  PUTT_BANDS_NINE,
  rate,
  roundsInFilter,
  seasonOnly,
  sgChange,
  tourForGender,
  type ChPuttBand,
  type ChRoundCache,
  type ChSgChange,
  type ChWindow,
} from './stats-common';
import { holeRounds } from './round-scope';
import { effectiveWindow, filterFor, roundKind, type ChFilter, type ChFilterOptions } from './stats-filter';
import { bigNumberRate, effectiveCount, perEighteen, summarizeWindow, weightedMean, type ChWindowSeason } from './stats-weight';
import { approachBands, loadApproachShots, loadHoles, loadSpray, type ChApproachBand, type ChSpray } from './stats-detail';
import {
  openingDelta,
  perRoundSeries,
  personalBests,
  pressureGap,
  toughestHoles,
  windowCompare,
  type ChBests,
  type ChCompare,
  type ChPressure,
  type ChSeries,
  type ChToughest,
} from './stats-figures';

/** The most rounds the shot-level reads take: getDetailedStats' own bound (an explicit round list is cut to it). */
export const DETAIL_MAX_ROUNDS = 100;

/**
 * Player profile (Clubhouse Stats). Shared by coaches and players with the
 * permissions they already have:
 *   coach  - any active player on their team, with team comparisons and
 *            previous/next navigation
 *   player - only themselves (the route never takes a player id from a
 *            player), compared against the Tour only, never against teammates
 * Shot-level detail comes from getDetailedStats, which enforces the same
 * access rule server-side (the player, or a coach in the player's org).
 */

export type ChViewer = 'coach' | 'player';

export interface ChProfileRound {
  id: string;
  course: string;
  date: string;
  /** practice, qualifier or tournament (a legacy "qualifying" reads as qualifier); null where the round has no type. */
  type: 'practice' | 'qualifier' | 'tournament' | null;
  /** 9 or 18. */
  holes: number;
  score: number;
  toPar: number | null;
  gir: string | null;
  putts: number | null;
  sg: number | null;
  /** Off the tee, approach, around the green, putting; null where the round has none. */
  sgLegs: [number | null, number | null, number | null, number | null];
}

export interface ChComparison {
  label: string;
  /** The heading the row sits under in the table (Strokes gained, Scoring, Putting ...). */
  group: string;
  you: number | null;
  team: number | null;
  /** The Tour's average for the stat where golf_pga_standards has one; null draws no column value. */
  bench: number | null;
  unit: '' | '%' | ' ft';
  digits: number;
  lowerIsBetter: boolean;
  /** Strokes gained: shown with a sign, gain green and loss amber, against the Tour (there is no D1 strokes gained). */
  sg?: boolean;
  /** Shown with a sign and coloured by better or worse against its reference (the pressure gap, the opening hole). */
  signed?: boolean;
  /** What the row needs before it has a value, said under its label while it has none (CH-5318). */
  floor?: string;
}

/** What the profile's Game detail and Rounds tab show beyond the shot-level figures (the parity pass, PARITY.md). */
export interface ChProfileExtra {
  /** Personal bests over the window's 18-hole rounds (the best score and to par count a round posted as a total only; greens and putts do not). */
  bests: ChBests;
  /** ...and over its 9-hole rounds, listed on their own (a 9-hole score and an 18-hole score are not the same best); null when the window has none. */
  bests9: ChBests | null;
  /** How many of the window's rounds are 9 holes: the score and putt lines draw those per 18 and say so. */
  nineRounds: number;
  series: ChSeries;
  /** This window against the one before it; null for Season and Qualifiers (no earlier window by design) and when there are fewer than three earlier rounds. */
  compare: ChCompare | null;
  pressure: ChPressure;
  /** Hole 1 against holes 2 to 18; null when the hole read failed. */
  opening: { delta: number | null; rounds: number } | null;
  toughest: ChToughest | null;
  holesError: boolean;
  /** Approach proximity against the Tour in the production's three bands; null when the read failed or there are no approaches. */
  approach: ChApproachBand[] | null;
  approachError: boolean;
  spray: ChSpray | null;
  sprayError: boolean;
  /** The nine putting bands (the calculator's), each graded against the Tour where it publishes a standard; null when there are no putts or the read failed. */
  puttBandsNine: ChPuttBand[] | null;
  /** The putt read failed: the make-rate curve stops at 20 feet and says so. */
  puttsError: boolean;
  /** The window has more rounds than the shot-level reads take (the newest 100 are read). */
  truncated: boolean;
  /**
   * How many of the window's rounds have their holes scored: every hole-level figure (birdies, greens, fairways, putts, scrambling, strokes
   * gained, scoring by par, putting) reads these, not the rounds posted as a total only (Q-123). Fewer than `win.rounds` means the cards
   * say so ("Hole stats from 3 of 5 rounds"). Absent: every round has its holes.
   */
  holeRounds?: number;
}

export interface ChPlayerProfile {
  viewer: ChViewer;
  window: ChWindow;
  /** The round filter in force (the address's), and what its sheet can list: this player's loaded rounds only. */
  filter: ChFilter;
  filterOptions: ChFilterOptions;
  id: string;
  name: string;
  firstName: string;
  classYear: string | null;
  gradYear: number | null;
  hometown: string | null;
  status: 'active' | 'inactive';
  handicap: number | null;
  season: ChPlayerSeason;
  /** Window-scoped summary: per 18 holes (a nine-hole round counts as half a round), and in whole rounds for the floors. */
  win: ChWindowSeason;
  teamAvg: number | null;
  /** What the strokes gained here is measured against; null when the team's own row didn't load. */
  tour: ChSgTour;
  /** The window's strokes gained a round against the previous 10 (the hero chip). */
  sgChange: ChSgChange;
  /** Make rate by distance from the shots in the window (the team page's bands); null when there are none or the read failed. */
  puttBands: ChPuttBand[] | null;
  extra: ChProfileExtra;
  rounds: ChProfileRound[];
  comparisons: ChComparison[];
  stats: GolfStats | null;
  statsError: boolean;
  /** The round cache didn't load: fairways, greens, putts, scrambling and the standing's cache rows are missing, not empty (C-24f, CH-5213). */
  cacheError: boolean;
  /** The Tour's averages by metric id (the team's own tour). */
  bench: Record<string, number>;
  focusAreas: Array<{ id: string; title: string; baseline: number | null; current: number | null; target: number | null; metric: string | null; status: string | null }>;
  goals: Array<{ id: string; title: string; state: string | null; current: number | null; target: number | null; baseline: number | null }>;
  devError: boolean;
  nav: { index: number; total: number; prev: string; next: string } | null;
  roundsError: boolean;
}

/**
 * getDetailedStats' round-level fallback (stats-data `buildFallbackDetailedStats`, after a failed or timed-out shot read):
 * it counts the rounds but scores no hole, so every hole-level figure (birdies, pars, scrambling, putting by distance,
 * proximity) reads zero. `windowRounds` is the window's rounds with their holes scored (a round posted as a total only has none to
 * read, and is not given to the shot read), so a real answer always counts some. Exported for the tests.
 */
export function isRoundLevelFallback(stats: GolfStats | null | undefined, windowRounds: number): boolean {
  if (!stats || windowRounds === 0 || !(stats.roundsPlayed > 0)) return false;
  return stats.totalEagles + stats.totalBirdies + stats.totalPars + stats.totalBogeys + stats.totalDoublePlus === 0;
}

export async function loadPlayerProfile(input: {
  viewer: ChViewer;
  teamId: string;
  playerId: string;
  window: ChWindow;
  /** The round filter; omitted, it is the window alone. */
  filter?: ChFilter;
}): Promise<ChPlayerProfile | null> {
  const f = input.filter ?? filterFor(input.window);
  const supabase = await createClient();
  const now = new Date();

  const [teamRes, playerRes, memberRes] = await Promise.all([
    supabase.from('golf_teams').select('gender').eq('id', input.teamId).maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, first_name, last_name, graduation_year, hometown, state, handicap, handicap_index')
      .eq('id', input.playerId)
      .maybeSingle(),
    // Active and inactive members are on the roster; a pending or removed row is not (the same rule as Roster).
    supabase.from('golf_team_members').select('status').eq('team_id', input.teamId).eq('player_id', input.playerId).in('status', ['active', 'inactive']).maybeSingle(),
  ]);
  if (playerRes.error) chLogServer('stats', 'player', playerRes.error);
  if (teamRes.error) chLogServer('stats', 'team', teamRes.error, 'teams');
  if (memberRes.error) chLogServer('stats', 'membership', memberRes.error, 'teams');
  // A read that failed says nothing about the roster: the route error view offers Try again, never "not on your team" (CH-5306).
  if (playerRes.error || memberRes.error) throw new Error('Clubhouse: the player profile read failed');
  const p = playerRes.data;
  // Not on this team (or not readable): the page shows not-found, never another team's player.
  if (!p || !memberRes.data) return null;

  // CH-5208: without the team's row its tour is unknown, so no benchmark is claimed (a women's team is never graded against the men's).
  const tour = teamRes.error ? null : tourForGender(teamRes.data?.gender);

  // Coaches compare against the active team and page through it; players see only themselves.
  let teamIds: string[] = [input.playerId];
  if (input.viewer === 'coach') {
    const { data, error } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', input.teamId)
      .eq('status', 'active');
    if (error) chLogServer('stats', 'teamMembers', error, 'teams');
    teamIds = [...new Set([input.playerId, ...(data ?? []).map((m) => m.player_id)])];
  }

  const [seasonRes, bench, focusRes, goalsRes] = await Promise.all([
    loadSeasonRounds(supabase, teamIds, { surface: 'stats', since: loadSince(f) }),
    tour ? loadTourBenchmarks(supabase, tour, 'stats') : Promise.resolve(new Map<string, number>()),
    supabase
      .from('golf_player_focus_areas')
      .select('id, title, baseline_value, current_value, target_value, target_metric, status')
      .eq('player_id', input.playerId)
      .in('status', ['active', 'proposed'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('golf_goals')
      .select('id, title, state, current_value, target_value, baseline_value')
      .eq('player_id', input.playerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  if (focusRes.error) chLogServer('stats', 'focusAreas', focusRes.error, 'development');
  if (goalsRes.error) chLogServer('stats', 'goals', goalsRes.error, 'development');

  const byPlayer = groupByPlayer(seasonRes.rounds);
  const mine = byPlayer.get(input.playerId) ?? [];
  const winRounds = roundsInFilter(mine, f);
  // A custom range, and Last 10, can read rounds from before the season: the season's own figures count this season only.
  const season = summarizePlayer(seasonOnly(mine));
  const win = summarizeWindow(winRounds);
  // Q-123: a round posted as a total only is a score and nothing else. Every hole-level figure reads the window's rounds with their holes.
  const holeWin = holeRounds(winRounds);

  // Team rounds in the same window, for coach comparisons only (scores: all of them; hole-level: those with their holes).
  const teamWin = input.viewer === 'coach' ? teamIds.flatMap((id) => roundsInFilter(byPlayer.get(id) ?? [], f)) : [];
  const teamHole = holeRounds(teamWin);
  // Every shot-level figure counts exactly the window's own rounds with their holes (the ones the Rounds table lists, of the lengths the filter chose),
  // newest 100 at most: the detail read is given these ids instead of a date preset, which would count a different set.
  const scopeIds = holeWin.slice(0, DETAIL_MAX_ROUNDS).map((r) => r.id);
  const [detail, cache, putts, holes, approachShots, sprayRead] = await Promise.all([
    scopeIds.length
      ? getDetailedStats(input.playerId, scopeIds).then(
          (s) => ({ stats: s, error: false }),
          (e: unknown) => {
            chLogServer('stats', 'detailedStats', e, 'stats_analytics');
            return { stats: null, error: true };
          },
        )
      : Promise.resolve({ stats: null, error: false }),
    loadRoundCache(supabase, [...holeWin, ...teamHole].map((r) => r.id), 'stats'),
    // The same shot-level bands as Team stats, so the make-rate curve reaches 25+ feet with exact counts.
    loadPutts(supabase, scopeIds),
    loadHoles(supabase, scopeIds),
    loadApproachShots(supabase, scopeIds),
    scopeIds.length ? loadSpray(input.playerId, scopeIds) : Promise.resolve({ spray: null, error: false }),
  ]);
  const rows = (ids: string[]) => ids.map((id) => cache.byRound.get(id)).filter((x): x is ChRoundCache => !!x);
  const mineCache = rows(holeWin.map((r) => r.id));
  const teamCache = rows(teamHole.map((r) => r.id));
  const teamAvg = input.viewer === 'coach' ? weightedMean(teamWin, (r) => r.total_score) : null;
  // Per-round figures are per 18 holes (a nine-hole round is half a round); the rates pool the holes and shots.
  const cacheNum = (r: ChRound, key: keyof ChRoundCache): number | null => {
    const v = cache.byRound.get(r.id)?.[key];
    return typeof v === 'number' ? v : null;
  };
  const t = input.viewer === 'coach';

  // CH-5208: without Tour benchmarks the Tour column reads "—"; nothing is compared with a benchmark it doesn't have.
  // Strokes gained against the Tour (its benchmark is zero by definition), with the team's pooled mean for a coach; a player is never compared with teammates.
  const sgPool = (pick: (r: ChRound) => number | null) => (effectiveCount(teamHole, pick) >= MIN_SG_ROUNDS ? weightedMean(teamHole, pick) : null);
  const sgRow = (label: string, you: number | null, pick: (r: ChRound) => number | null): ChComparison => ({
    label,
    group: 'Strokes gained',
    you,
    team: t ? sgPool(pick) : null,
    bench: null,
    unit: '',
    digits: 1,
    lowerIsBetter: false,
    sg: true,
  });

  // getDetailedStats answers a failed read with zeroed stats. Rounds in the
  // window with their holes and no rounds in the detail means the detail read failed; so does its
  // round-level fallback (C-14: a timed-out shot read), which counts the rounds but
  // scores no hole, though every round given to it has its holes. A window of totals only gave it
  // no round (nothing to read, not a failure): Game detail says there are no shot-by-shot rounds (CH-5301).
  const detailFallback = isRoundLevelFallback(detail.stats, holeWin.length);
  const detailFailed = detail.error || (holeWin.length > 0 && (detail.stats?.roundsPlayed ?? 0) === 0) || detailFallback;
  if (detailFailed && !detail.error) chLogServer('stats', detailFallback ? 'detailedStatsFallback' : 'detailedStatsEmpty', `no detail for ${holeWin.length} rounds`, 'stats_analytics');
  // The calculator's per-round counts and scoring average are not per 18 when a nine-hole round is in the window, and its scoring leaves out
  // a round posted as a total only: restated (stats-weight).
  const s = detailFailed || !detail.stats ? null : perEighteen(detail.stats, winRounds);

  // Strokes gained against the previous 10 matching rounds; only the newest-ten cut has one (not a range, not picked rounds).
  const prevList = previousInFilter(mine, f);
  const sgDelta = sgChange(win.sgPerRound, prevList ? summarizeWindow(prevList).sgPerRound : null, effectiveWindow(f), earlierInFilter(mine, f));
  const puttBands = putts.error || !putts.rows.length ? null : bandPutts(putts.rows, bench);
  const puttBandsNine = putts.error || !putts.rows.length ? null : bandPutts(putts.rows, bench, PUTT_BANDS_NINE);
  const approach = approachShots.error || !approachShots.rows.length ? null : approachBands(approachShots.rows, bench);
  const pressure = pressureGap(winRounds);
  const opening = holes.error ? null : openingDelta(holes.rows);
  const toughest = holes.error ? null : toughestHoles(holes.rows);

  // Standing, in the window: the same metrics production grades against the Tour (and, for a coach, against the team where the window's own
  // round cache has the figure). A figure with no sample or no Tour value is null, never a zero.
  const teamRate = (made: keyof ChRoundCache, total: keyof ChRoundCache) => (t ? rate(teamCache, made, total) : null);
  const per = (rs: ChRound[], key: keyof ChRoundCache) => weightedMean(rs, (r) => cacheNum(r, key));
  const teamPer = (key: keyof ChRoundCache) => (t ? per(teamHole, key) : null);
  const bigNumbersPct = (rs: ChRound[]) =>
    bigNumberRate(
      rs.flatMap((r) => {
        const c = cache.byRound.get(r.id);
        return c ? [{ holes_played: r.holes_played, doubles: c.double_bogeys, triples: c.triple_plus }] : [];
      }),
    );
  const parAvg = (p: 3 | 4 | 5) => {
    const d = s?.scoringByPar?.[`par${p}` as const];
    return d && d.total > 0 && d.avgToPar != null ? p + d.avgToPar : null;
  };
  const band = (label: string) => puttBands?.find((b) => b.label === label);
  const makeRate = (label: string) => {
    const b = band(label);
    return b && b.attempts >= 10 ? (b.made / b.attempts) * 100 : null;
  };
  const prox = (label: string) => approach?.find((b) => b.label === label)?.value ?? null;
  const row = (
    group: string,
    label: string,
    you: number | null,
    team: number | null,
    benchMetric: string | null,
    unit: ChComparison['unit'],
    digits: number,
    lowerIsBetter: boolean,
    opts: { signed?: boolean; floor?: string } = {},
  ): ChComparison => ({
    label,
    group,
    you,
    team,
    bench: benchMetric ? (bench.get(benchMetric) ?? null) : null,
    unit,
    digits,
    lowerIsBetter,
    ...(opts.signed ? { signed: true } : {}),
    ...(opts.floor ? { floor: opts.floor } : {}),
  });
  const PROX_FLOOR = 'Needs 10 approaches from the range.';
  const BAND_FLOOR = 'Needs 10 putts in the band.';
  const comparisons: ChComparison[] = [
    sgRow('SG total', win.sgPerRound, (r) => r.strokes_gained_total),
    sgRow('SG off the tee', win.sgLegs.tee, (r) => r.strokes_gained_tee),
    sgRow('SG approach', win.sgLegs.approach, (r) => r.strokes_gained_approach),
    sgRow('SG around green', win.sgLegs.around, (r) => r.strokes_gained_around_green),
    sgRow('SG putting', win.sgLegs.putting, (r) => r.strokes_gained_putting),
    row('Scoring', 'Scoring avg', win.avg, teamAvg, null, '', 1, true),
    row('Scoring', 'Par 3 scoring', parAvg(3), null, 'scoring_par_3', '', 2, true),
    row('Scoring', 'Par 4 scoring', parAvg(4), null, 'scoring_par_4', '', 2, true),
    row('Scoring', 'Par 5 scoring', parAvg(5), null, 'scoring_par_5', '', 2, true),
    row('Scoring', 'Big numbers', bigNumbersPct(holeWin), t ? bigNumbersPct(teamHole) : null, 'big_number_rate', '%', 1, true),
    row('Driving', 'Fairways hit', rate(mineCache, 'fairways_hit', 'fairways_total'), teamRate('fairways_hit', 'fairways_total'), null, '%', 0, false),
    row('Approach', 'Greens in regulation', rate(mineCache, 'greens_hit', 'greens_total'), teamRate('greens_hit', 'greens_total'), 'gir_pct', '%', 0, false),
    row('Approach', 'Proximity 50–125 yd', prox('50-125 yd'), null, 'approach_proximity_50_125ft', ' ft', 0, true, { floor: PROX_FLOOR }),
    row('Approach', 'Proximity 125–175 yd', prox('125-175 yd'), null, 'approach_proximity_125_175ft', ' ft', 0, true, { floor: PROX_FLOOR }),
    row('Approach', 'Proximity 175+ yd', prox('175+ yd'), null, 'approach_proximity_175_plus_ft', ' ft', 0, true, { floor: PROX_FLOOR }),
    row('Short game', 'Scrambling', rate(mineCache, 'scrambles_converted', 'scramble_attempts'), teamRate('scrambles_converted', 'scramble_attempts'), null, '%', 0, false),
    row('Short game', 'Scrambling from the fairway', s?.scramblingPctFairway ?? null, null, 'scrambling_pct_fairway', '%', 0, false),
    row('Short game', 'Scrambling from the rough', s?.scramblingPctRough ?? null, null, 'scrambling_pct_rough', '%', 0, false),
    row('Short game', 'Sand saves', rate(mineCache, 'sand_saves', 'sand_attempts'), teamRate('sand_saves', 'sand_attempts'), 'scrambling_pct_sand', '%', 0, false),
    row('Putting', 'Putts per round', per(holeWin, 'total_putts'), teamPer('total_putts'), null, '', 1, true),
    row('Putting', '3-putts per round', per(holeWin, 'three_putts'), teamPer('three_putts'), null, '', 2, true),
    row('Putting', 'Make 3–5 ft', makeRate('3–5 ft'), null, 'putts_made_3_5ft_pct', '%', 0, false, { floor: BAND_FLOOR }),
    row('Putting', 'Make 5–10 ft', makeRate('5–10 ft'), null, 'putts_made_5_10ft_pct', '%', 0, false, { floor: BAND_FLOOR }),
    row('Putting', 'Make 10–15 ft', makeRate('10–15 ft'), null, 'putts_made_10_15ft_pct', '%', 0, false, { floor: BAND_FLOOR }),
    row('Putting', 'Make 15–25 ft', makeRate('15–25 ft'), null, 'putts_made_15_25ft_pct', '%', 0, false, { floor: BAND_FLOOR }),
    row('Putting', 'Make 25+ ft', makeRate('25+ ft'), null, 'putts_made_25_plus_ft_pct', '%', 0, false, { floor: BAND_FLOOR }),
    row('Course management', 'Penalty strokes', per(holeWin, 'penalty_strokes'), teamPer('penalty_strokes'), 'penalty_rate_per_round', '', 1, true),
    row('Pressure', 'Pressure gap', pressure.gap, null, 'practice_tournament_delta', '', 1, true, { signed: true, floor: 'Needs 3 tournament or qualifier rounds and 3 practice rounds.' }),
    row('Pressure', 'Opening hole', opening?.delta ?? null, null, 'opening_hole_delta', '', 1, true, { signed: true, floor: 'Needs 5 rounds scored hole by hole.' }),
  ];

  let nav: ChPlayerProfile['nav'] = null;
  if (input.viewer === 'coach') {
    const order = teamIds
      .map((id) => ({ id, avg: summarizePlayer(seasonOnly(byPlayer.get(id) ?? [])).avg }))
      .sort((a, b) => (a.avg ?? 999) - (b.avg ?? 999));
    const i = order.findIndex((o) => o.id === input.playerId);
    if (order.length > 1 && i >= 0) {
      nav = {
        index: i + 1,
        total: order.length,
        prev: order[(i - 1 + order.length) % order.length]!.id,
        next: order[(i + 1) % order.length]!.id,
      };
    }
  }

  return {
    viewer: input.viewer,
    window: f.window,
    filter: f,
    filterOptions: filterOptions(mine),
    id: p.id,
    name: fullName(p),
    firstName: p.first_name || fullName(p),
    classYear: classYearLabel(p.graduation_year, now),
    gradYear: p.graduation_year,
    hometown: [p.hometown, p.state].filter(Boolean).join(', ') || null,
    status: memberRes.data.status === 'inactive' ? 'inactive' : 'active',
    handicap: p.handicap_index ?? p.handicap,
    season,
    win,
    teamAvg,
    tour,
    sgChange: sgDelta,
    puttBands,
    extra: {
      // An 18-hole score and a 9-hole score are not the same best: each length is listed on its own.
      bests: personalBests(winRounds.filter((r) => (r.holes_played ?? 18) === 18)),
      bests9: winRounds.some((r) => r.holes_played === 9) ? personalBests(winRounds.filter((r) => r.holes_played === 9)) : null,
      nineRounds: winRounds.filter((r) => r.holes_played === 9).length,
      series: perRoundSeries(winRounds),
      compare: windowCompare(winRounds, prevList),
      pressure,
      opening,
      toughest,
      holesError: holes.error,
      approach,
      approachError: approachShots.error,
      spray: sprayRead.spray,
      sprayError: sprayRead.error,
      puttBandsNine,
      puttsError: putts.error,
      truncated: holeWin.length > DETAIL_MAX_ROUNDS,
      holeRounds: holeWin.length,
    },
    rounds: winRounds.map((r) => {
      const c = cache.byRound.get(r.id);
      // A round posted as a total only has no greens or putts to show, whatever its row holds (Q-123).
      const total = !!r.total_only;
      return {
        id: r.id,
        course: r.course_name ?? 'Course not recorded',
        date: shortDate(r.round_date),
        type: roundKind(r.round_type),
        holes: r.holes_played ?? 18,
        score: r.total_score as number,
        toPar: r.score_to_par,
        gir: total ? null : c?.greens_total ? `${c.greens_hit ?? 0}/${c.greens_total}` : r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : null,
        putts: total ? null : (c?.total_putts ?? r.total_putts),
        sg: r.strokes_gained_total,
        sgLegs: [r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting],
      };
    }),
    comparisons,
    stats: s,
    statsError: detailFailed,
    cacheError: cache.error,
    bench: Object.fromEntries(bench),
    focusAreas: (focusRes.data ?? []).map((f) => ({
      id: f.id,
      title: f.title,
      baseline: f.baseline_value,
      current: f.current_value,
      target: f.target_value,
      metric: f.target_metric,
      status: f.status,
    })),
    goals: (goalsRes.data ?? []).map((g) => ({
      id: g.id,
      title: g.title,
      state: g.state,
      current: g.current_value,
      target: g.target_value,
      baseline: g.baseline_value,
    })),
    devError: !!focusRes.error || !!goalsRes.error,
    nav,
    roundsError: seasonRes.error,
  };
}
