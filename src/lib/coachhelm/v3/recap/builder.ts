/**
 * v3 weekly coach email — data builder (W37).
 *
 * Pure-ish: given a coach + a week window, query the existing schema
 * and assemble a `WeeklyRecap` object the template can render. No
 * Resend coupling here.
 *
 * Window: the recap covers the 7 days ending on the Sunday this cron
 * fires (Sunday 18:00 local per master plan). Caller passes the
 * canonical week_end_iso so per-team timezone handling stays at the
 * cron layer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';

type Sb = SupabaseClient<Database>;

export interface WeeklyRecap {
  team_id: string;
  team_name: string;
  coach_first_name: string;
  week_start_iso: string;
  week_end_iso: string;
  totals: {
    rounds_played: number;
    insights_surfaced: number;
    goals_active: number;
    avg_score_to_par: number | null;
  };
  /** Top 3 players by rounds played this week (active engagement). */
  active_players: Array<{
    player_id: string;
    name: string;
    rounds: number;
    avg_score_to_par: number | null;
  }>;
  /** Top 3 most-mentioned insight types across the team this week. */
  top_patterns: Array<{
    insight_type: string;
    player_count: number;
  }>;
}

export async function buildWeeklyRecap(
  sb: Sb,
  args: {
    coach_id: string;
    team_id: string;
    week_end_iso: string;
  },
): Promise<WeeklyRecap | null> {
  const weekEnd = new Date(args.week_end_iso);
  const weekStart = new Date(weekEnd.getTime() - 7 * 86400_000);

  const [{ data: team }, { data: coach }] = await Promise.all([
    sb.from('golf_teams').select('name').eq('id', args.team_id).maybeSingle(),
    sb.from('golf_coaches').select('full_name').eq('id', args.coach_id).maybeSingle(),
  ]);
  if (!team || !coach) return null;
  // golf_coaches stores full_name; split for the email greeting.
  const coachFirstName = (coach.full_name ?? '').trim().split(/\s+/)[0] || 'Coach';

  // Roster
  const { data: members } = await sb
    .from('golf_team_members')
    .select('player_id, player:golf_players(id, first_name, last_name)')
    .eq('team_id', args.team_id)
    .eq('status', 'active');
  const playerIds = (members ?? []).map((m) => m.player_id);

  // Rounds this week
  let totalRounds = 0;
  let totalScoreToPar = 0;
  let scoredRounds = 0;
  const perPlayer = new Map<string, { rounds: number; sum: number; n: number }>();
  if (playerIds.length > 0) {
    const { data: rounds } = await sb
      .from('golf_rounds')
      .select('player_id, score_to_par')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .gte('round_date', weekStart.toISOString().slice(0, 10))
      .lte('round_date', weekEnd.toISOString().slice(0, 10));
    for (const r of rounds ?? []) {
      totalRounds += 1;
      const slot = perPlayer.get(r.player_id) ?? { rounds: 0, sum: 0, n: 0 };
      slot.rounds += 1;
      if (typeof r.score_to_par === 'number') {
        slot.sum += r.score_to_par;
        slot.n += 1;
        totalScoreToPar += r.score_to_par;
        scoredRounds += 1;
      }
      perPlayer.set(r.player_id, slot);
    }
  }

  // Active players ranked
  const nameById = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.player as { id: string; first_name: string; last_name: string } | null;
    if (p) nameById.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
  }
  const active_players = Array.from(perPlayer.entries())
    .map(([player_id, slot]) => ({
      player_id,
      name: nameById.get(player_id) ?? 'Player',
      rounds: slot.rounds,
      avg_score_to_par: slot.n > 0 ? slot.sum / slot.n : null,
    }))
    .sort((a, b) => b.rounds - a.rounds)
    .slice(0, 3);

  // Insights this week
  let insightsCount = 0;
  const insightTypeCount = new Map<string, Set<string>>();
  if (playerIds.length > 0) {
    // Apply the SAME product-visibility contract (P2): the weekly recap email's
    // "insights surfaced" totals + top-pattern rollup must count only
    // product-visible rows — never stale v2, archived, tentative, or dismissed
    // rows the coach would never actually see in-app.
    const { data: insights } = await applyInsightVisibility(
      sb
        .from('golf_coach_insights')
        .select('insight_type, player_id, created_at')
        .in('player_id', playerIds)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString()),
    );
    insightsCount = (insights ?? []).length;
    for (const row of insights ?? []) {
      if (!row.player_id) continue;
      if (!insightTypeCount.has(row.insight_type)) insightTypeCount.set(row.insight_type, new Set());
      insightTypeCount.get(row.insight_type)!.add(row.player_id);
    }
  }
  const top_patterns = Array.from(insightTypeCount.entries())
    .map(([insight_type, players]) => ({ insight_type, player_count: players.size }))
    .sort((a, b) => b.player_count - a.player_count)
    .slice(0, 3);

  // Active goals
  let goalsActive = 0;
  if (playerIds.length > 0) {
    const { count } = await sb
      .from('golf_goals')
      .select('id', { count: 'exact', head: true })
      .in('player_id', playerIds)
      .eq('state', 'active');
    goalsActive = count ?? 0;
  }

  return {
    team_id: args.team_id,
    team_name: team.name,
    coach_first_name: coachFirstName,
    week_start_iso: weekStart.toISOString(),
    week_end_iso: weekEnd.toISOString(),
    totals: {
      rounds_played: totalRounds,
      insights_surfaced: insightsCount,
      goals_active: goalsActive,
      avg_score_to_par: scoredRounds > 0 ? totalScoreToPar / scoredRounds : null,
    },
    active_players,
    top_patterns,
  };
}
