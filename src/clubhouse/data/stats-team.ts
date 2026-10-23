import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { formatSigned } from '../lib/format';
import { sgBaseline, type ChSgTour } from '../lib/sg';
import { fullName, groupByPlayer, loadSeasonRounds, mean, MIN_SG_ROUNDS, shortDate, type ChRound } from './season';
import {
  bandPutts,
  cachedPutts,
  earlierInFilter,
  filterOptions,
  loadLongestPutt,
  loadTourBenchmarks,
  loadPutts,
  loadRoundCache,
  loadSince,
  previousInFilter,
  rate,
  rateSample,
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
import { effectiveWindow, filterFor, hasPrevious, previousWords, type ChFilter, type ChFilterOptions, type ChLast } from './stats-filter';
import { effectiveCount, effectiveRounds, roundValues, summarizeWindow, weightedMean, windowChangeSe } from './stats-weight';
import { changeSe, floorRate, meanSe, needsText, type SpreadKind } from '../lib/stats-signal';
import { plural } from '../lib/plural';

/**
 * Team Stats (Clubhouse). Trends and strokes gained first; the owner removed
 * the team stat sheet. Every figure states its window and sample, and a
 * failed read is flagged per section, never shown as zero.
 */

export const LEGS = ['Off the tee', 'Approach', 'Around green', 'Putting'] as const;
export type ChLeg = (typeof LEGS)[number];

export interface ChFigure {
  /** Which figure this is, so a view finds it by name and never by its place in the list. */
  key: 'sg' | 'score' | 'gir' | 'putts' | 'scramble' | 'birdies';
  /** The figure on each week of `weeks`, the line drawn under it; null where a week has no rounds for it. */
  series: Array<number | null>;
  label: string;
  value: number | null;
  unit: '' | '%';
  digits: number;
  /** Change against the previous window; null when there is no previous window. */
  delta: number | null;
  /**
   * The change's standard error (both windows' round values, Q4): the change is green or amber only when it clears it, else neutral
   * ink and "No clear change". Null when it cannot be measured (no previous window, or a figure under five rounds with no pooled spread).
   */
  se?: number | null;
  /** Lower is better (scoring, putts). Drives the chip colour. */
  lowerIsBetter: boolean;
  context: string;
  /** Shown with a sign and green or amber (strokes gained). */
  signed?: boolean;
  /** A second line under the context: what the figure is measured against. */
  note?: string;
  /** `empty`: no value (strokes gained needs rounds with shots). `no-comparison`: a value, with no earlier rounds to set it against. Drives the catalog states. */
  state?: 'empty' | 'no-comparison';
  /**
   * How the figure is drawn under its value, against a reference the data gives (owner, 2026-10-07: no bare numbers):
   * strokes gained from the Tour's zero, the scoring average from par, a rate on its 0 to 100 track (with the Tour's
   * mark when there is one; scrambling has no Tour figure overall, so its mark is the previous window's rate), putts against two on every green (36), birdies as holes out of 18.
   */
  gauge?: ChGauge;
}

/** One figure's sample: whole rounds (a nine-hole round is half) and the standard error of the mean; null with no round values. */
export interface ChRankSample {
  n: number;
  se: number | null;
}

/** A grid row's samples: strokes gained total, each leg in `LEGS` order, and the scoring average. */
export interface ChRankSpread {
  sg: ChRankSample;
  legs: ChRankSample[];
  score: ChRankSample;
}

export type ChGauge =
  | { kind: 'sg'; tour?: ChSgTour }
  | { kind: 'par'; toPar: number | null }
  | { kind: 'rate'; ref?: number | null; refLabel?: string }
  | { kind: 'putts' }
  | { kind: 'holes' };

export interface ChTeamStats {
  teamName: string;
  /** The team's season ("Fall 2026"), beside its name in the head's eyebrow as Roster's; null when the team has none. */
  season?: string | null;
  window: ChWindow;
  /** How many rounds Last N counts (read with `window: 'last10'`). */
  last: ChLast;
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
  days: Array<{ label: string; score: number | null; n?: number }>;
  /** Weekly averages, and the window's own mean (strokes gained per round, scoring average), which is what the headline and the sort read. */
  team: { sg: Array<number | null>; score: Array<number | null>; sgMean: number | null; scoreMean: number | null };
  players: Array<{ id: string; name: string; first: string; sg: Array<number | null>; score: Array<number | null>; sgMean: number | null; scoreMean: number | null }>;
  legWeeks: Record<ChLeg, Array<number | null>>;
  grid: Array<{
    id: string;
    name: string;
    rounds: number;
    legs: Array<number | null>;
    total: number | null;
    change: number | null;
    /** The standard error of `change` (the two halves' per-18 spreads combined); the grid paints the change only past it (A1). */
    changeSe?: number | null;
    /** Scoring average over the window's rounds, per 18 holes (the phone's player list). */
    avg: number | null;
    /**
     * How sure each of the row's figures is, for the ranked dot plot (TeamRank): the whole rounds behind it and the standard error
     * of its mean, from the player's own per-18 round values (their spread from five rounds, the pooled one below). Absent on a
     * row built elsewhere; the plot then falls back on the pooled spread over `rounds`.
     */
    spread?: ChRankSpread;
    /** The player's newest scored round (the hover card's "Last round"); null with none. */
    last?: { score: number; toPar: number | null; label: string } | null;
  }>;
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
  /** The season's longest putt did not load: Season bests says so instead of leaving the line out (CH-4211). */
  longestError: boolean;
}

/** A round's strokes gained in each leg, in `LEGS` order. */
export function sgLegs(r: ChRound): Array<number | null> {
  return [r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting];
}

export async function loadTeamStats(input: { teamId: string; window: ChWindow; filter?: ChFilter }): Promise<ChTeamStats> {
  const f = input.filter ?? filterFor(input.window);
  const supabase = await createClient();
  const [teamRes, membersRes] = await Promise.all([
    supabase.from('golf_teams').select('name, gender, season').eq('id', input.teamId).maybeSingle(),
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
  const [cache, putts, longest, bench] = await Promise.all([
    loadRoundCache(supabase, figureIds, 'stats'),
    // Only the window's putts, for its bands (the previous window's and the season's were read for nothing: the bands count the window).
    loadPutts(supabase, holeWindow.map((r) => r.id)),
    // The season's longest made putt is one row from the database, not every putt of the season to find it.
    loadLongestPutt(supabase, holeRounds(seasonRounds).map((r) => r.id)),
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
  // Birdies are holes one under par, eagles not folded in: production's definition (the Fairway Team stats page counts
  // `score === par - 1`, and the round cache's `birdies` is the same holes), so a round with an eagle reads the same here.
  const birdiesOf = (r: ChRound): number | null => cacheNum(r, 'birdies');
  // A round with no putt recorded has no putts figure (cachedPutts), as on the Fairway pages.
  const puttsOf = (r: ChRound): number | null => cachedPutts(cache.byRound.get(r.id));
  // Scoring counts every round (a total-only one included); greens, putts, scrambling, birdies and strokes gained the rounds with their holes.
  const scoring = weightedMean(windowRounds, (r) => r.total_score);
  // Per 18 holes, as the scoring average is: what the gauge draws from par.
  const toPar = weightedMean(windowRounds, (r) => r.score_to_par);
  const prevScoring = hasPrev ? weightedMean(prevRounds, (r) => r.total_score) : null;
  // Rates held to their floors (A7): greens need two rounds with a green to hit, scrambling ten chances.
  const gir = floorRate('fraction', rateSample(cur, 'greens_total', 'round'), rate(cur, 'greens_hit', 'greens_total'));
  const puttsPer = weightedMean(holeWindow, puttsOf);
  const scramble = floorRate('scramble', rateSample(cur, 'scramble_attempts', 'chance'), rate(cur, 'scrambles_converted', 'scramble_attempts'));
  const birdies = weightedMean(holeWindow, birdiesOf);
  const d = (a: number | null, b: number | null) => (hasPrev && a != null && b != null ? a - b : null);
  // Each change's standard error (Q4), over the same rounds its two means read: per 18 for a per-round figure, a round's own rate for
  // greens and scrambling. Scores and strokes gained fall back on the pooled spread; the rest need five rounds to measure one.
  const seOf = (pick: (r: ChRound) => number | null, cur: ChRound[], before: ChRound[], kind: 'sg' | 'score' | null) => (hasPrev ? windowChangeSe(cur, before, pick, kind) : null);
  const roundRates = (rows: ChRoundCache[], made: keyof ChRoundCache, total: keyof ChRoundCache) =>
    rows.flatMap((r) => {
      const m = r[made];
      const t = r[total];
      return typeof m === 'number' && typeof t === 'number' && t > 0 ? [(m / t) * 100] : [];
    });
  const rateSe = (made: keyof ChRoundCache, total: keyof ChRoundCache) => (hasPrev ? changeSe(roundRates(curPaired, made, total), roundRates(prev, made, total), null) : null);
  const benchGir = bench.get('gir_pct');
  const count = (n: number) => `${plural(n, 'round')}`;
  const sample = count(windowRounds.length);
  // The hole-level cards rest on the rounds with their holes: their own count, and when it is fewer than the window's, a line saying so.
  const holeSample = count(holeWindow.length);
  const coverage = holeCoverage(holeWindow.length, windowRounds.length) ?? undefined;
  // An early-read rate (A7) says so on its second line. The coverage line it would carry is the one every hole-level card shares,
  // which the page draws once under them, so the tag takes its place rather than joining it.
  const withEarly = (early: string | undefined) => early ?? coverage;
  // A rate under its floor or still an early read has no change to colour (A7): no value or an untoned one, so no chip.
  const steady = (r: { state: string }) => r.state === 'steady';
  // Strokes gained per round: the window's mean over its rounds with strokes gained, against the previous 10 when there is one.
  // A4: only the players with three whole rounds with shots in the window count, as each player's own figure and the previous
  // stretch do, so one player's first round or two never swings the headline or the leg totals.
  const sgOf = (r: ChRound) => r.strokes_gained_total;
  const sgReady = new Set(players.filter((p) => effectiveCount(holeWindow.filter((r) => r.player_id === p.id), sgOf) >= MIN_SG_ROUNDS).map((p) => p.id));
  const sgWindow = holeWindow.filter((r) => sgReady.has(r.player_id));
  const sgPairedWindow = holePaired.filter((r) => sgReady.has(r.player_id));
  const sgNow = sgWindow.map(sgOf).filter((v): v is number => v != null);
  const sgTotal = weightedMean(sgWindow, sgOf);
  const earlier = players.reduce((a, p) => a + earlierInFilter(byPlayer.get(p.id) ?? [], f), 0);
  // The previous stretch needs three whole rounds with shots, as the window's own figures do.
  const sgPrev = effectiveCount(holePrev, (r) => r.strokes_gained_total) >= MIN_SG_ROUNDS ? weightedMean(holePrev, (r) => r.strokes_gained_total) : null;
  // The reason (or "vs previous 10") reads the whole window; the number compares the same players (Q-112).
  const sgBase = sgChange(sgTotal, sgPrev, effectiveWindow(f), earlier, null, f.last);
  const sgPaired = weightedMean(sgPairedWindow, sgOf);
  const sgDelta =
    sgBase.delta != null
      ? { ...sgBase, delta: sgPaired != null && sgPrev != null ? sgPaired - sgPrev : null, se: windowChangeSe(sgPairedWindow, holePrev, sgOf, 'sg') }
      : sgBase;
  const baseline = sgBaseline(tour);
  // Weekly trend: team and each player, strokes gained and scoring.
  const weekKeys = [...new Set(windowRounds.map((r) => weekOf(r.round_date)))].sort().slice(-10);
  const inWeek = (rs: ChRound[], wk: string) => rs.filter((r) => weekOf(r.round_date) === wk);
  const avgOf = (rs: ChRound[], pick: (r: ChRound) => number | null) => weightedMean(rs, pick);
  const weekRows = (wk: string) => rowsFor(inWeek(holeWindow, wk));
  const figures: ChFigure[] = [
    {
      key: 'sg',
      series: weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), (r) => r.strokes_gained_total)),
      label: 'Team SG per round',
      value: sgTotal,
      unit: '',
      digits: 1,
      signed: true,
      delta: sgDelta.delta,
      se: sgDelta.se ?? null,
      lowerIsBetter: false,
      // With rounds with shots but no player at the floor yet, the card says what it needs (A4), never a number from one round.
      context: sgDelta.context || (sgNow.length ? `${plural(sgNow.length, 'round')} with shots` : holeWindow.some((r) => sgOf(r) != null) ? `${needsText('sgLong')} with shots from one player` : 'Needs rounds with shots'),
      state: sgTotal == null ? 'empty' : sgDelta.delta == null && sgDelta.context ? 'no-comparison' : undefined,
      // Always drawn, so the card is as tall as its loading skeleton (CH-4401).
      note: `${baseline.vs}${sgNow.length && sgDelta.context ? ` · ${plural(sgNow.length, 'round')} with shots` : ''}`,
      gauge: { kind: 'sg', tour },
    },
    { key: 'score', series: weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => r.total_score)), label: 'Scoring average', value: scoring, unit: '', digits: 1, delta: d(weightedMean(windowPaired, (r) => r.total_score), prevScoring), se: seOf((r) => r.total_score, windowPaired, prevRounds, 'score'), lowerIsBetter: true, context: hasPrev ? previousWords(f.last) : sample, gauge: { kind: 'par', toPar } },
    // CH-4209: without Tour benchmarks, greens read against the sample instead of "Tour averages".
    { key: 'gir', series: weekKeys.map((wk) => rate(weekRows(wk), 'greens_hit', 'greens_total')), label: 'Greens in regulation', value: gir.value, unit: '%', digits: 0, delta: steady(gir) ? d(rate(curPaired, 'greens_hit', 'greens_total'), rate(prev, 'greens_hit', 'greens_total')) : null, se: steady(gir) ? rateSe('greens_hit', 'greens_total') : null, lowerIsBetter: false, context: gir.needs ?? (benchGir != null ? `Tour averages ${Math.round(benchGir)}%` : holeSample), ...(gir.needs ? { state: 'empty' as const } : {}), note: withEarly(gir.early), gauge: { kind: 'rate', ref: benchGir ?? null } },
    { key: 'putts', series: weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), puttsOf)), label: 'Putts per round', value: puttsPer, unit: '', digits: 1, delta: d(weightedMean(holePaired, puttsOf), weightedMean(holePrev, puttsOf)), se: seOf(puttsOf, holePaired, holePrev, null), lowerIsBetter: true, context: hasPrev ? previousWords(f.last) : holeSample, note: coverage, gauge: { kind: 'putts' } },
    { key: 'scramble', series: weekKeys.map((wk) => rate(weekRows(wk), 'scrambles_converted', 'scramble_attempts')), label: 'Scrambling', value: scramble.value, unit: '%', digits: 0, delta: steady(scramble) ? d(rate(curPaired, 'scrambles_converted', 'scramble_attempts'), rate(prev, 'scrambles_converted', 'scramble_attempts')) : null, se: steady(scramble) ? rateSe('scrambles_converted', 'scramble_attempts') : null, lowerIsBetter: false, context: scramble.needs ?? (hasPrev ? previousWords(f.last) : holeSample), ...(scramble.needs ? { state: 'empty' as const } : {}), note: withEarly(scramble.early), gauge: { kind: 'rate', ref: hasPrev ? rate(prev, 'scrambles_converted', 'scramble_attempts') : null } },
    {
      key: 'birdies',
      series: weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), birdiesOf)),
      label: 'Birdies per round',
      value: birdies,
      unit: '',
      digits: 1,
      delta: d(weightedMean(holePaired, birdiesOf), weightedMean(holePrev, birdiesOf)),
      se: seOf(birdiesOf, holePaired, holePrev, null),
      lowerIsBetter: false,
      context: 'Eagles not counted',
      note: coverage,
      gauge: { kind: 'holes' },
    },
  ];

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
  const grid = teamGrid(players, season.rounds, f);

  // Putting make rate by distance.
  let putting: ChTeamStats['putting'] = null;
  if (!putts.error && putts.rows.length) {
    putting = { bands: bandPutts(putts.rows, bench), putts: putts.rows.length };
  }

  // Season bests stay season-wide whatever the filter (and a custom range that reads earlier rounds): the section says so.
  const bests = seasonBests(seasonOnly(seasonFull), players, cache.byRound, longest.error ? null : { longest: longest.longest, rounds: seasonRounds });

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    season: teamRes.data?.season ?? null,
    window: f.window,
    last: f.last,
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
      .map((d) => {
        const on = windowRounds.filter((r) => r.round_date === d);
        // `n`: the whole rounds the day's average rests on, so the phone's mean weighs a day of six rounds above a day of one (A8.10).
        return { label: shortDate(d), score: avgOf(on, (r) => r.total_score), n: effectiveCount(on, (r) => r.total_score) };
      }),
    team: {
      sg: weekKeys.map((wk) => avgOf(inWeek(holeWindow, wk), (r) => r.strokes_gained_total)),
      score: weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => r.total_score)),
      sgMean: sgTotal,
      scoreMean: scoring,
    },
    players: playerSeries,
    legWeeks,
    grid,
    legTotals: LEGS.map((_, i) => avgOf(sgWindow, (r) => sgLegs(r)[i] ?? null)),
    putting,
    bests,
    tour,
    sgChange: sgDelta,
    sgRounds: sgNow.length,
    roundsError: season.error || !!membersRes.error,
    cacheError: cache.error,
    puttsError: putts.error,
    longestError: longest.error,
  };
}

/**
 * The player x leg grid (Team Stats' TeamRank and grid, and Coach Home's "The team's game"): for each player with a round
 * in the filter, their strokes gained per round in each leg (three or more whole rounds with it, else null), in total,
 * the late-half against early-half change, the scoring average and each figure's sample. Pure: the rounds are the
 * loaded ones of `players` (the active roster), grouped by player here, and nothing outside `players` is counted.
 */
export function teamGrid(players: Array<{ id: string; first_name: string | null; last_name: string | null }>, rounds: ChRound[], f: ChFilter): ChTeamStats['grid'] {
  const byPlayer = groupByPlayer(rounds);
  return players
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
      const changeSe = change == null ? null : windowChangeSe(sgMine.slice(sgMine.length - half), sgMine.slice(0, half), sgOf, 'sg');
      // The ranked dot plot's whiskers: each figure's own round values from the rounds it reads (no new read).
      const sample = (rs: ChRound[], pick: (r: ChRound) => number | null, kind: SpreadKind): ChRankSample => {
        const v = roundValues(rs, pick);
        return { n: v.n, se: meanSe(v.values, kind, v.n) };
      };
      const spread: ChRankSpread = {
        sg: sample(mineHoles, sgOf, 'sg'),
        legs: LEGS.map((_, i) => sample(mineHoles, (r) => sgLegs(r)[i] ?? null, 'sg')),
        score: sample(mine.filter((r) => r.total_score != null), (r) => r.total_score, 'score'),
      };
      // Newest scored round in the window, for the hover card (the grid never carried one: the card read "Last round —").
      const newest = mine.reduce<ChRound | null>((a, r) => (r.total_score != null && (a == null || r.round_date > a.round_date) ? r : a), null);
      const last = newest
        ? { score: newest.total_score as number, toPar: newest.score_to_par, label: [newest.course_name, shortDate(newest.round_date)].filter(Boolean).join(' \u00b7 ') }
        : null;
      return { id: p.id, name: fullName(p), rounds: mine.length, legs, total: s.sgPerRound, change, changeSe, avg: s.avg, spread, last };
    })
    .filter((g) => g.rounds > 0);
}

function seasonBests(
  rounds: ChRound[],
  players: Array<{ id: string; first_name: string | null; last_name: string | null }>,
  cache: Map<string, ChRoundCache>,
  putts: { longest: { roundId: string; feet: number } | null; rounds: ChRound[] } | null,
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
    // Birdies only, as the Birdies per round card counts them.
    .map((r) => ({ r, n: cache.get(r.id)?.birdies ?? 0, known: cache.get(r.id)?.birdies != null }))
    .filter((x) => x.known)
    .sort((a, b) => b.n - a.n)[0];
  if (birdie && birdie.n > 0) {
    out.push({ label: 'Most birdies', playerId: birdie.r.player_id, name: name.get(birdie.r.player_id)!, value: String(birdie.n), meta: meta(birdie.r) });
  }
  const sg = valid.filter((r) => r.strokes_gained_total != null).sort((a, b) => b.strokes_gained_total! - a.strokes_gained_total!)[0];
  if (sg) {
    const v = sg.strokes_gained_total!;
    out.push({ label: 'Best SG round', playerId: sg.player_id, name: name.get(sg.player_id)!, value: formatSigned(v), meta: meta(sg) });
  }
  // Longest putt made, from shot-level putting data (any countable round this season).
  if (putts) {
    const roundById = new Map(putts.rounds.filter((r) => name.has(r.player_id)).map((r) => [r.id, r]));
    const top = putts.longest && roundById.has(putts.longest.roundId) ? putts.longest : undefined;
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
