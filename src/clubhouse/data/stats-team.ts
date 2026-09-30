import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { chLogServer } from '../lib/track-server';
import { fullName, groupByPlayer, loadSeasonRounds, mean, shortDate, summarizePlayer, type ChRound } from './season';
import {
  loadD1,
  loadRoundCache,
  perRound,
  previousWindow,
  rate,
  roundsInWindow,
  tourForGender,
  weekLabel,
  weekOf,
  type ChRoundCache,
  type ChWindow,
} from './stats-common';

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
}

export interface ChTeamStats {
  teamName: string;
  window: ChWindow;
  activeCount: number;
  roundCount: number;
  figures: ChFigure[];
  weeks: string[];
  team: { sg: Array<number | null>; score: Array<number | null> };
  players: Array<{ id: string; name: string; first: string; sg: Array<number | null>; score: Array<number | null> }>;
  legWeeks: Record<ChLeg, Array<number | null>>;
  grid: Array<{ id: string; name: string; rounds: number; legs: Array<number | null>; total: number | null; change: number | null }>;
  putting: { bands: Array<{ label: string; made: number; attempts: number; d1: number | null }>; putts: number } | null;
  bests: Array<{ label: string; playerId: string; name: string; value: string; meta: string; under?: boolean }>;
  sgBaselineNote: string;
  roundsError: boolean;
  cacheError: boolean;
  puttsError: boolean;
}

const PUTT_BANDS: Array<{ label: string; lo: number; hi: number; metric: string | null }> = [
  { label: '0–3 ft', lo: 0, hi: 3, metric: null },
  { label: '3–5 ft', lo: 3, hi: 5, metric: 'putts_made_3_5ft_pct' },
  { label: '5–10 ft', lo: 5, hi: 10, metric: 'putts_made_5_10ft_pct' },
  { label: '10–15 ft', lo: 10, hi: 15, metric: 'putts_made_10_15ft_pct' },
  { label: '15–25 ft', lo: 15, hi: 25, metric: 'putts_made_15_25ft_pct' },
  { label: '25+ ft', lo: 25, hi: Infinity, metric: 'putts_made_25_plus_ft_pct' },
];

function sgLegs(r: ChRound): Array<number | null> {
  return [r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting];
}

export async function loadTeamStats(input: { teamId: string; window: ChWindow }): Promise<ChTeamStats> {
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
  // (a women's team must never be graded against the men's D1 averages).
  const tour = teamRes.error ? null : tourForGender(teamRes.data?.gender);
  const d1Promise = tour ? loadD1(supabase, tour, 'stats') : Promise.resolve(new Map<string, number>());

  const season = players.length
    ? await loadSeasonRounds(supabase, players.map((p) => p.id), { surface: 'stats' })
    : { rounds: [], error: !!membersRes.error };
  const byPlayer = groupByPlayer(season.rounds);

  const windowRounds: ChRound[] = [];
  const prevRounds: ChRound[] = [];
  let hasPrev = input.window === 'last10';
  for (const p of players) {
    const list = byPlayer.get(p.id) ?? [];
    windowRounds.push(...roundsInWindow(list, input.window));
    const prev = previousWindow(list, input.window);
    if (prev) prevRounds.push(...prev);
  }
  if (!prevRounds.length) hasPrev = false;

  // One cache read serves the window, the previous window and the season bests: both windows
  // are 18-hole season rounds, so they are inside `seasonFull`.
  const seasonFull = season.rounds.filter((r) => (r.holes_played ?? 18) === 18);
  const [cache, putts, d1] = await Promise.all([
    loadRoundCache(supabase, seasonFull.map((r) => r.id), 'stats'),
    // The whole season's putts: the window's bands, and the season's longest made putt.
    loadPutts(supabase, season.rounds.map((r) => r.id)),
    d1Promise,
  ]);
  const rowsFor = (rs: ChRound[]) => rs.map((r) => cache.byRound.get(r.id)).filter((x): x is ChRoundCache => !!x);
  const cur = rowsFor(windowRounds);
  const prev = rowsFor(prevRounds);

  const scoring = mean(windowRounds.map((r) => r.total_score as number));
  const prevScoring = hasPrev ? mean(prevRounds.map((r) => r.total_score as number)) : null;
  const gir = rate(cur, 'greens_hit', 'greens_total');
  const puttsPer = perRound(cur, 'total_putts');
  const scramble = rate(cur, 'scrambles_converted', 'scramble_attempts');
  const birdies = cur.length ? cur.reduce((a, r) => a + (r.birdies ?? 0) + (r.eagles ?? 0), 0) / cur.length : null;
  const d = (a: number | null, b: number | null) => (hasPrev && a != null && b != null ? a - b : null);
  const d1Gir = d1.get('gir_pct');
  const sample = `${windowRounds.length} ${windowRounds.length === 1 ? 'round' : 'rounds'}`;
  const figures: ChFigure[] = [
    { label: 'Scoring average', value: scoring, unit: '', digits: 1, delta: d(scoring, prevScoring), lowerIsBetter: true, context: hasPrev ? 'vs. previous 10' : sample },
    // CH-4209: without D1 benchmarks, greens read against the sample instead of "D1 averages".
    { label: 'Greens in regulation', value: gir, unit: '%', digits: 0, delta: d(gir, rate(prev, 'greens_hit', 'greens_total')), lowerIsBetter: false, context: d1Gir != null ? `D1 averages ${Math.round(d1Gir)}%` : sample },
    { label: 'Putts per round', value: puttsPer, unit: '', digits: 1, delta: d(puttsPer, perRound(prev, 'total_putts')), lowerIsBetter: true, context: hasPrev ? 'vs. previous 10' : sample },
    { label: 'Scrambling', value: scramble, unit: '%', digits: 0, delta: d(scramble, rate(prev, 'scrambles_converted', 'scramble_attempts')), lowerIsBetter: false, context: hasPrev ? 'vs. previous 10' : sample },
    {
      label: 'Birdies per round',
      value: birdies,
      unit: '',
      digits: 1,
      delta: d(birdies, prev.length ? prev.reduce((a, r) => a + (r.birdies ?? 0) + (r.eagles ?? 0), 0) / prev.length : null),
      lowerIsBetter: false,
      context: 'Birdies and eagles',
    },
  ];

  // Weekly trend: team and each player, strokes gained and scoring.
  const weekKeys = [...new Set(windowRounds.map((r) => weekOf(r.round_date)))].sort().slice(-10);
  const inWeek = (rs: ChRound[], wk: string) => rs.filter((r) => weekOf(r.round_date) === wk);
  const avgOf = (rs: ChRound[], pick: (r: ChRound) => number | null) => mean(rs.map(pick).filter((v): v is number => v != null));
  const playerSeries = players
    .map((p) => {
      const mine = roundsInWindow(byPlayer.get(p.id) ?? [], input.window);
      return {
        id: p.id,
        name: fullName(p),
        first: p.first_name || fullName(p),
        sg: weekKeys.map((wk) => avgOf(inWeek(mine, wk), (r) => r.strokes_gained_total)),
        score: weekKeys.map((wk) => avgOf(inWeek(mine, wk), (r) => r.total_score)),
      };
    })
    .filter((s) => s.score.some((v) => v != null));
  const legWeeks = Object.fromEntries(
    LEGS.map((leg, i) => [leg, weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => sgLegs(r)[i] ?? null))]),
  ) as Record<ChLeg, Array<number | null>>;

  // Player x leg grid.
  const grid = players
    .map((p) => {
      const mine = roundsInWindow(byPlayer.get(p.id) ?? [], input.window);
      const s = summarizePlayer(mine);
      const legs = LEGS.map((_, i) => {
        const v = mine.map((r) => sgLegs(r)[i]).filter((x): x is number => x != null);
        return v.length >= 3 ? mean(v) : null;
      });
      const sgVals = mine.map((r) => r.strokes_gained_total).filter((x): x is number => x != null).reverse();
      const half = Math.floor(sgVals.length / 2);
      const change = sgVals.length >= 4 ? (mean(sgVals.slice(sgVals.length - half)) ?? 0) - (mean(sgVals.slice(0, half)) ?? 0) : null;
      return { id: p.id, name: fullName(p), rounds: mine.length, legs, total: s.sgPerRound, change };
    })
    .filter((g) => g.rounds > 0);

  // Putting make rate by distance.
  let putting: ChTeamStats['putting'] = null;
  const windowIds = new Set(windowRounds.map((r) => r.id));
  const windowPutts = putts.rows.filter((r) => windowIds.has(r.roundId));
  if (!putts.error && windowPutts.length) {
    const bands = PUTT_BANDS.map((b) => {
      const inBand = windowPutts.filter((r) => r.feet >= b.lo && r.feet < b.hi);
      return { label: b.label, attempts: inBand.length, made: inBand.filter((r) => r.made).length, d1: b.metric ? (d1.get(b.metric) ?? null) : null };
    });
    putting = { bands, putts: windowPutts.length };
  }

  const bests = seasonBests(seasonFull, players, cache.byRound, putts.error ? null : { rows: putts.rows, rounds: season.rounds });

  return {
    teamName: teamRes.data?.name ?? 'Your team',
    window: input.window,
    activeCount: players.length,
    roundCount: windowRounds.length,
    figures,
    weeks: weekKeys.map(weekLabel),
    team: {
      sg: weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => r.strokes_gained_total)),
      score: weekKeys.map((wk) => avgOf(inWeek(windowRounds, wk), (r) => r.total_score)),
    },
    players: playerSeries,
    legWeeks,
    grid,
    putting,
    bests,
    sgBaselineNote: tour === 'lpga' ? "the women's baseline" : tour === 'pga' ? 'the Tour baseline' : 'the baseline',
    roundsError: season.error || !!membersRes.error,
    cacheError: cache.error,
    puttsError: putts.error,
  };
}

async function loadPutts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roundIds: string[],
): Promise<{ rows: Array<{ roundId: string; feet: number; made: boolean }>; error: boolean }> {
  const rows: Array<{ roundId: string; feet: number; made: boolean }> = [];
  // The chunks are independent, so they are read in parallel.
  const results = await Promise.all(
    chunkIds(roundIds).map((ids) =>
      fetchAllRowsResult<{ round_id: string; putt_distance_feet: number | null; putt_made: boolean | null }>(
        (from, to) =>
          supabase
            .from('golf_shots')
            .select('round_id, putt_distance_feet, putt_made')
            .in('round_id', ids)
            .not('putt_distance_feet', 'is', null)
            .not('putt_made', 'is', null)
            .order('id', { ascending: true })
            .range(from, to),
        undefined,
        { table: 'golf_shots', action: 'clubhouse.stats.putts', feature: 'stats_analytics', sport: 'golf' },
      ),
    ),
  );
  for (const res of results) {
    if (res.error) {
      chLogServer('stats', 'putts', res.error, 'stats_analytics');
      return { rows: [], error: true };
    }
    for (const r of res.data ?? []) {
      const feet = Number(r.putt_distance_feet);
      if (Number.isFinite(feet) && feet >= 0 && feet <= 120) rows.push({ roundId: r.round_id, feet, made: !!r.putt_made });
    }
  }
  return { rows, error: false };
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
