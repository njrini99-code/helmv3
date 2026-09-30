import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getDetailedStats } from '@/app/golf/actions/stats-data';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { chLogServer } from '../lib/track-server';
import { classYearLabel, fullName, groupByPlayer, loadSeasonRounds, mean, shortDate, summarizePlayer, type ChPlayerSeason } from './season';
import {
  loadD1,
  loadRoundCache,
  perRound,
  rate,
  roundsInWindow,
  tourForGender,
  windowFilter,
  type ChRoundCache,
  type ChWindow,
} from './stats-common';

/**
 * Player profile (Clubhouse Stats). Shared by coaches and players with the
 * permissions they already have:
 *   coach  - any active player on their team, with team comparisons and
 *            previous/next navigation
 *   player - only themselves (the route never takes a player id from a
 *            player), compared against D1 only, never against teammates
 * Shot-level detail comes from getDetailedStats, which enforces the same
 * access rule server-side (the player, or a coach in the player's org).
 */

export type ChViewer = 'coach' | 'player';

export interface ChProfileRound {
  id: string;
  course: string;
  date: string;
  score: number;
  toPar: number | null;
  gir: string | null;
  putts: number | null;
  sg: number | null;
}

export interface ChComparison {
  label: string;
  you: number | null;
  team: number | null;
  d1: number | null;
  unit: '' | '%';
  digits: number;
  lowerIsBetter: boolean;
}

export interface ChPlayerProfile {
  viewer: ChViewer;
  window: ChWindow;
  id: string;
  name: string;
  firstName: string;
  classYear: string | null;
  gradYear: number | null;
  hometown: string | null;
  status: 'active' | 'inactive';
  handicap: number | null;
  season: ChPlayerSeason;
  /** Window-scoped summary (Last 10 / Season / Qualifiers). */
  win: ChPlayerSeason;
  teamAvg: number | null;
  rounds: ChProfileRound[];
  comparisons: ChComparison[];
  stats: GolfStats | null;
  statsError: boolean;
  d1: Record<string, number>;
  focusAreas: Array<{ id: string; title: string; baseline: number | null; current: number | null; target: number | null; metric: string | null; status: string | null }>;
  goals: Array<{ id: string; title: string; state: string | null; current: number | null; target: number | null; baseline: number | null }>;
  devError: boolean;
  nav: { index: number; total: number; prev: string; next: string } | null;
  roundsError: boolean;
}

export async function loadPlayerProfile(input: {
  viewer: ChViewer;
  teamId: string;
  playerId: string;
  window: ChWindow;
}): Promise<ChPlayerProfile | null> {
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

  // CH-5208: without the team's row its tour is unknown, so no D1 benchmark is claimed (a women's team is never graded against the men's).
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

  const [seasonRes, detail, d1, focusRes, goalsRes] = await Promise.all([
    loadSeasonRounds(supabase, teamIds, { surface: 'stats' }),
    getDetailedStats(input.playerId, 'overall', windowFilter(input.window)).then(
      (s) => ({ stats: s, error: false }),
      (e: unknown) => {
        chLogServer('stats', 'detailedStats', e, 'stats_analytics');
        return { stats: null, error: true };
      },
    ),
    tour ? loadD1(supabase, tour, 'stats') : Promise.resolve(new Map<string, number>()),
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
  const winRounds = roundsInWindow(mine, input.window);
  const season = summarizePlayer(mine);
  const win = summarizePlayer(winRounds);

  // Team rounds in the same window, for coach comparisons only.
  const teamWin = input.viewer === 'coach' ? teamIds.flatMap((id) => roundsInWindow(byPlayer.get(id) ?? [], input.window)) : [];
  const cache = await loadRoundCache(supabase, [...winRounds, ...teamWin].map((r) => r.id), 'stats');
  const rows = (ids: string[]) => ids.map((id) => cache.byRound.get(id)).filter((x): x is ChRoundCache => !!x);
  const mineCache = rows(winRounds.map((r) => r.id));
  const teamCache = rows(teamWin.map((r) => r.id));
  const teamAvg = input.viewer === 'coach' ? mean(teamWin.map((r) => r.total_score as number)) : null;
  const t = input.viewer === 'coach';

  // CH-5208: without D1 benchmarks the D1 column reads "—"; nothing is compared with a benchmark it doesn't have.
  const d1Gir = d1.get('gir_pct') ?? null;
  const comparisons: ChComparison[] = [
    { label: 'Scoring avg', you: win.avg, team: teamAvg, d1: null, unit: '', digits: 1, lowerIsBetter: true },
    { label: 'Fairways hit', you: rate(mineCache, 'fairways_hit', 'fairways_total'), team: t ? rate(teamCache, 'fairways_hit', 'fairways_total') : null, d1: null, unit: '%', digits: 0, lowerIsBetter: false },
    { label: 'Greens in regulation', you: rate(mineCache, 'greens_hit', 'greens_total'), team: t ? rate(teamCache, 'greens_hit', 'greens_total') : null, d1: d1Gir, unit: '%', digits: 0, lowerIsBetter: false },
    { label: 'Putts per round', you: perRound(mineCache, 'total_putts'), team: t ? perRound(teamCache, 'total_putts') : null, d1: null, unit: '', digits: 1, lowerIsBetter: true },
    { label: 'Scrambling', you: rate(mineCache, 'scrambles_converted', 'scramble_attempts'), team: t ? rate(teamCache, 'scrambles_converted', 'scramble_attempts') : null, d1: null, unit: '%', digits: 0, lowerIsBetter: false },
  ];

  // getDetailedStats answers a failed read with zeroed stats. Rounds in the
  // window with no rounds in the detail means the detail read failed.
  const detailFailed = detail.error || (winRounds.length > 0 && (detail.stats?.roundsPlayed ?? 0) === 0);
  if (detailFailed && !detail.error) chLogServer('stats', 'detailedStatsEmpty', `no detail for ${winRounds.length} rounds`, 'stats_analytics');

  let nav: ChPlayerProfile['nav'] = null;
  if (input.viewer === 'coach') {
    const order = teamIds
      .map((id) => ({ id, avg: summarizePlayer(byPlayer.get(id) ?? []).avg }))
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
    window: input.window,
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
    rounds: winRounds.map((r) => {
      const c = cache.byRound.get(r.id);
      return {
        id: r.id,
        course: r.course_name ?? 'Course not recorded',
        date: shortDate(r.round_date),
        score: r.total_score as number,
        toPar: r.score_to_par,
        gir: c?.greens_total ? `${c.greens_hit ?? 0}/${c.greens_total}` : r.total_gir != null && r.total_gir_possible ? `${r.total_gir}/${r.total_gir_possible}` : null,
        putts: c?.total_putts ?? r.total_putts,
        sg: r.strokes_gained_total,
      };
    }),
    comparisons,
    stats: detailFailed ? null : detail.stats,
    statsError: detailFailed,
    d1: Object.fromEntries(d1),
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
