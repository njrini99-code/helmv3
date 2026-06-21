/**
 * v3 coach chat — tool handlers (W32-pt2).
 *
 * 10 in-process tool handlers per Part XII.1. Each handler is a pure
 * function over a Supabase client: zod-validated input → typed output.
 * The agent (`agent.ts`) wires these into a ToolLoopAgent; an optional
 * follow-up wave can expose the same handlers at
 * /api/coachhelm/v3/agent-tools/<name> for admin debugging.
 *
 * Auth: handlers trust the caller's Supabase client. The send-message
 * endpoint (route.ts) authenticates the coach + uses a team-scoped
 * client so RLS guards what data the agent can read.
 *
 * NO chat tool writes to the database. The one would-be mutating tool,
 * `create_goal_for_player`, is PROPOSE-ONLY: it returns a structured
 * `GoalProposal` (no insert) so the chat UI can render a Confirm/Cancel
 * card. Only an explicit coach "Confirm" click runs the real `createGoal`
 * server action (auth-checked + RLS-gated) from the UI. The system prompt
 * is a soft fence; the UI confirmation is the load-bearing gate, so a model
 * misfire or prompt-injected "yes" can never create a goal row on its own.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import type { GoalProposal } from './types';

type Sb = SupabaseClient<Database>;

// ===========================================================================
// 1. get_player_context — profile + active counts (cheap orientation read)
// ===========================================================================

export const GetPlayerContextInput = z.object({
  player_id: z.string().uuid(),
});
export type GetPlayerContextInput = z.infer<typeof GetPlayerContextInput>;

export async function get_player_context(sb: Sb, input: GetPlayerContextInput) {
  const { data: player } = await sb
    .from('golf_players')
    .select('id, first_name, last_name, graduation_year')
    .eq('id', input.player_id)
    .maybeSingle();
  if (!player) return { error: 'Player not found' } as const;

  const { count: roundsCount } = await sb
    .from('golf_rounds')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', input.player_id)
    .eq('status', 'completed');

  const { count: activeGoalsCount } = await sb
    .from('golf_goals')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', input.player_id)
    .eq('state', 'active');

  return {
    player: {
      id: player.id,
      name: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      graduation_year: player.graduation_year ?? null,
    },
    rounds_completed: roundsCount ?? 0,
    active_goals: activeGoalsCount ?? 0,
  };
}

// ===========================================================================
// 2. get_player_insights — recent insights, optional category filter
// ===========================================================================

export const GetPlayerInsightsInput = z.object({
  player_id: z.string().uuid(),
  category: z
    .enum(['putting', 'tee', 'approach', 'short_game', 'scoring', 'pressure', 'course_management'])
    .optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type GetPlayerInsightsInput = z.infer<typeof GetPlayerInsightsInput>;

export async function get_player_insights(sb: Sb, input: GetPlayerInsightsInput) {
  // Apply the SAME product-visibility contract every coach surface uses (P2):
  // the chat agent quotes these rows verbatim into the coach's context, so it
  // must NEVER see stale v2 phantoms, dismissed rows, or — critically —
  // sweep-archived rows that the engine retracted (lifecycle_state='archived'
  // while status stays 'active', so a status-only filter cannot exclude them).
  // We also SELECT lifecycle_state so a future caller can never resurface a
  // retracted row, and apply the visibility filter so they never reach here.
  let q = applyInsightVisibility(
    sb
      .from('golf_coach_insights')
      .select('id, insight_type, category, title, content, evidence, lifecycle_state, created_at')
      .eq('player_id', input.player_id),
  )
    .order('created_at', { ascending: false })
    .limit(input.limit);
  if (input.category) q = q.eq('category', input.category);

  const { data } = await q;
  return {
    insights: (data ?? []).map((i) => ({
      id: i.id,
      type: i.insight_type,
      category: i.category,
      title: i.title,
      content: i.content,
      lifecycle_state: i.lifecycle_state,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headline_metric: (i.evidence as any)?.metric_label ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headline_value: (i.evidence as any)?.your_value_display ?? null,
      created_at: i.created_at,
    })),
  };
}

// ===========================================================================
// 3. get_player_standing — current standing rows (PGA delta + team pct)
// ===========================================================================

export const GetPlayerStandingInput = z.object({
  player_id: z.string().uuid(),
  metric_id: z.string().optional(),
});
export type GetPlayerStandingInput = z.infer<typeof GetPlayerStandingInput>;

export async function get_player_standing(sb: Sb, input: GetPlayerStandingInput) {
  let q = sb
    .from('golf_player_standing')
    .select('metric_id, player_value, team_avg, team_n, team_pct, pga_value, pga_delta, computed_at')
    .eq('player_id', input.player_id);
  if (input.metric_id) q = q.eq('metric_id', input.metric_id);
  const { data } = await q;
  return { standing: data ?? [] };
}

// ===========================================================================
// 4. get_player_recent_rounds
// ===========================================================================

export const GetPlayerRecentRoundsInput = z.object({
  player_id: z.string().uuid(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type GetPlayerRecentRoundsInput = z.infer<typeof GetPlayerRecentRoundsInput>;

export async function get_player_recent_rounds(sb: Sb, input: GetPlayerRecentRoundsInput) {
  const { data } = await sb
    .from('golf_rounds')
    .select('id, round_date, course_name, total_score, score_to_par, round_type')
    .eq('player_id', input.player_id)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(input.limit);
  return { rounds: data ?? [] };
}

// ===========================================================================
// 5. compare_players — side-by-side standing on one metric
// ===========================================================================

export const ComparePlayersInput = z.object({
  player_a_id: z.string().uuid(),
  player_b_id: z.string().uuid(),
  metric_id: z.string(),
});
export type ComparePlayersInput = z.infer<typeof ComparePlayersInput>;

export async function compare_players(sb: Sb, input: ComparePlayersInput) {
  const [{ data: a }, { data: b }] = await Promise.all([
    sb
      .from('golf_player_standing')
      .select('player_value, team_pct, pga_delta')
      .eq('player_id', input.player_a_id)
      .eq('metric_id', input.metric_id)
      .maybeSingle(),
    sb
      .from('golf_player_standing')
      .select('player_value, team_pct, pga_delta')
      .eq('player_id', input.player_b_id)
      .eq('metric_id', input.metric_id)
      .maybeSingle(),
  ]);
  return {
    metric_id: input.metric_id,
    player_a: a ?? null,
    player_b: b ?? null,
  };
}

// ===========================================================================
// 6. get_team_overview — roster + each player's last round to-par
// ===========================================================================

export const GetTeamOverviewInput = z.object({
  team_id: z.string().uuid(),
});
export type GetTeamOverviewInput = z.infer<typeof GetTeamOverviewInput>;

export async function get_team_overview(sb: Sb, input: GetTeamOverviewInput) {
  const { data: members } = await sb
    .from('golf_team_members')
    .select('player_id, player:golf_players(id, first_name, last_name)')
    .eq('team_id', input.team_id)
    .eq('status', 'active');
  const playerIds = (members ?? []).map((m) => m.player_id);
  if (playerIds.length === 0) return { players: [] };

  // Pull each player's most recent completed round.
  const { data: lastRounds } = await sb
    .from('golf_rounds')
    .select('player_id, score_to_par, round_date')
    .in('player_id', playerIds)
    .eq('status', 'completed')
    .order('round_date', { ascending: false });

  const lastByPlayer = new Map<string, { score_to_par: number | null; round_date: string }>();
  for (const r of lastRounds ?? []) {
    if (!lastByPlayer.has(r.player_id)) {
      lastByPlayer.set(r.player_id, { score_to_par: r.score_to_par, round_date: r.round_date });
    }
  }

  return {
    players: (members ?? [])
      .filter((m) => m.player && typeof m.player === 'object' && 'first_name' in m.player)
      .map((m) => {
        const p = m.player as { id: string; first_name: string; last_name: string };
        const last = lastByPlayer.get(m.player_id);
        return {
          id: p.id,
          name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          last_to_par: last?.score_to_par ?? null,
          last_round_date: last?.round_date ?? null,
        };
      }),
  };
}

// ===========================================================================
// 7. get_team_patterns — recent insights across team, grouped by type
// ===========================================================================

export const GetTeamPatternsInput = z.object({
  team_id: z.string().uuid(),
  window_days: z.number().int().min(1).max(120).default(30),
});
export type GetTeamPatternsInput = z.infer<typeof GetTeamPatternsInput>;

export async function get_team_patterns(sb: Sb, input: GetTeamPatternsInput) {
  const { data: members } = await sb
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', input.team_id)
    .eq('status', 'active');
  const playerIds = (members ?? []).map((m) => m.player_id);
  if (playerIds.length === 0) return { patterns: [] };

  const since = new Date(Date.now() - input.window_days * 86400_000).toISOString();
  // Apply the SAME product-visibility contract (P2): a "how many players have
  // this pattern" rollup the agent quotes must count only product-visible rows
  // — not stale v2, archived, tentative, or dismissed insights.
  const { data } = await applyInsightVisibility(
    sb
      .from('golf_coach_insights')
      .select('insight_type, player_id')
      .in('player_id', playerIds)
      .gte('created_at', since),
  );

  // Insights can be team-level (player_id NULL); skip those for a
  // "how many players have this pattern" rollup.
  const byType = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.player_id) continue;
    if (!byType.has(row.insight_type)) byType.set(row.insight_type, new Set());
    byType.get(row.insight_type)!.add(row.player_id);
  }
  return {
    patterns: Array.from(byType.entries())
      .map(([type, players]) => ({ insight_type: type, player_count: players.size }))
      .sort((a, b) => b.player_count - a.player_count),
  };
}

// ===========================================================================
// 8. list_player_goals — active goals for one player
// ===========================================================================

export const ListPlayerGoalsInput = z.object({
  player_id: z.string().uuid(),
});
export type ListPlayerGoalsInput = z.infer<typeof ListPlayerGoalsInput>;

export async function list_player_goals(sb: Sb, input: ListPlayerGoalsInput) {
  const { data } = await sb
    .from('golf_goals')
    .select('id, title, metric_id, target_value, current_value, ends_at, state')
    .eq('player_id', input.player_id)
    .eq('state', 'active')
    .order('ends_at', { ascending: true });
  return { goals: data ?? [] };
}

// ===========================================================================
// 9. get_goal_details
// ===========================================================================

export const GetGoalDetailsInput = z.object({
  goal_id: z.string().uuid(),
});
export type GetGoalDetailsInput = z.infer<typeof GetGoalDetailsInput>;

export async function get_goal_details(sb: Sb, input: GetGoalDetailsInput) {
  const { data } = await sb
    .from('golf_goals')
    .select(
      'id, player_id, title, metric_id, baseline_value, current_value, target_value, started_at, ends_at, state, snapshots',
    )
    .eq('id', input.goal_id)
    .maybeSingle();
  if (!data) return { error: 'Goal not found' } as const;
  return { goal: data };
}

// ===========================================================================
// 10. create_goal_for_player — PROPOSE-ONLY. This tool performs NO database
//     write. It returns a structured `GoalProposal` (kind: 'create_goal')
//     so the chat UI can render a Confirm/Cancel card. The real insert only
//     happens when the coach clicks "Confirm", which calls the auth-checked,
//     RLS-gated `createGoal` server action from the UI (NOT inside this tool
//     loop). This is the load-bearing gate: a model misfire or a
//     prompt-injected "yes" can surface a proposal card but can never create
//     a goal row on its own. Returning a proposal is read-only + side-effect
//     free; we still validate that the player is on the coach's active team so
//     we never surface a card that the confirm step would just reject.
// ===========================================================================

export const CreateGoalForPlayerInput = z.object({
  player_id: z.string().uuid(),
  metric_id: z.string(),
  title: z.string().min(1).max(120),
  target_value: z.number(),
  window_days: z.number().int().min(7).max(365),
  coach_assignment_mode: z.enum(['mandatory', 'suggested']).default('suggested'),
});
export type CreateGoalForPlayerInput = z.infer<typeof CreateGoalForPlayerInput>;

/** Result of the propose-only goal tool: either a proposal card or an error. */
export type CreateGoalForPlayerResult =
  | { proposal: GoalProposal }
  | { error: string };

export async function create_goal_for_player(
  sb: Sb,
  input: CreateGoalForPlayerInput,
): Promise<CreateGoalForPlayerResult> {
  // Side-effect free: confirm the player exists + is on an active team (so the
  // confirm step won't fail RLS), grab the display name, then return a
  // PROPOSAL. We never insert here — the UI's explicit Confirm click does.
  const { data: player, error: playerError } = await sb
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('id', input.player_id)
    .maybeSingle();
  if (playerError) {
    return { error: `player lookup failed: ${playerError.message}` };
  }
  if (!player) {
    return { error: 'Player not found' };
  }

  const { data: membership, error: membershipError } = await sb
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', input.player_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    return { error: `team lookup failed: ${membershipError.message}` };
  }
  if (!membership?.team_id) {
    return { error: 'Player is not on an active team' };
  }

  const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();

  return {
    proposal: {
      kind: 'create_goal',
      player_id: input.player_id,
      team_id: membership.team_id,
      player_name: playerName || null,
      metric_id: input.metric_id,
      title: input.title,
      target_value: input.target_value,
      window_days: input.window_days,
      coach_assignment_mode: input.coach_assignment_mode,
    },
  };
}
