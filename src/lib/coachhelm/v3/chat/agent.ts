/**
 * v3 coach chat — ToolLoopAgent definition (W32-pt2).
 *
 * Wires the 10 tool handlers from `tools.ts` into an `ai`
 * ToolLoopAgent. The agent is Sonnet-only per master plan Part XI.5
 * (the only LLM task not on Haiku — coach chat's multi-step tool
 * calls need the better reasoning).
 *
 * IMPORTANT: `create_goal_for_player` is the only mutating tool. The
 * model is instructed never to call it without explicit coach
 * "Confirm" via the UI dialog (Part XII.2). The UI is the real gate;
 * the instructions are the soft fence.
 */

import { ToolLoopAgent, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  GetPlayerContextInput, get_player_context,
  GetPlayerInsightsInput, get_player_insights,
  GetPlayerStandingInput, get_player_standing,
  GetPlayerRecentRoundsInput, get_player_recent_rounds,
  ComparePlayersInput, compare_players,
  GetTeamOverviewInput, get_team_overview,
  GetTeamPatternsInput, get_team_patterns,
  ListPlayerGoalsInput, list_player_goals,
  GetGoalDetailsInput, get_goal_details,
  CreateGoalForPlayerInput, create_goal_for_player,
} from './tools';
import { MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';

export const COACH_CHAT_INSTRUCTIONS = `
You are a college golf coach's analytics assistant. The coach is your user.

Use the provided tools to look up player data, recent rounds, standings,
goals, and team patterns before making any claim. Never invent numbers,
metric values, or player names — only state what tools return.

When the coach asks "why is <player> worse?", call get_player_insights
+ get_player_recent_rounds and reason from the data. Cite specific
numbers from the tool responses.

For goals: list_player_goals + get_goal_details for inspection.
create_goal_for_player is the ONLY mutating tool. NEVER call
create_goal_for_player without the coach saying "yes" / "confirm" / "go
ahead" in the immediately preceding message. If a goal seems warranted,
propose it in prose with the proposed parameters and wait for explicit
confirmation. The UI will surface a Confirm/Edit/Cancel dialog if you
propose one.

Keep replies concise — 2-4 short paragraphs or a list. The coach is
busy.
`.trim();

/**
 * Resolve the logged-in coach's team(s) so the agent is tailored to them and
 * never has to ask the coach for a "team ID".
 */
async function resolveCoachTeamContext(
  sb: SupabaseClient<Database>,
  coach_id: string,
): Promise<string> {
  const { data: staff } = await sb
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach_id);
  const teamIds = (staff ?? [])
    .map((s) => s.team_id)
    .filter((id): id is string => !!id);
  if (teamIds.length === 0) return '';
  const { data: teams } = await sb
    .from('golf_teams')
    .select('id, name')
    .in('id', teamIds);
  const list = (teams ?? []).filter((t) => !!t.id);
  if (list.length === 0) return '';
  if (list.length === 1) {
    const t = list[0];
    if (!t) return '';
    return `\n\n## Your coach context (ALWAYS use this — never ask the coach for a team ID)\nYou are the analytics assistant for the head coach of **${t.name}** (team_id: ${t.id}). Use THIS team_id for every team-scoped tool (get_team_overview, get_team_patterns). When the coach says "the team", "my team", "who needs the most help", "the roster", etc., it means ${t.name} — call the team tools with ${t.id} directly. To resolve a player by name, call get_team_overview with ${t.id} first to get player ids. You already have the ID — never ask for it.`;
  }
  const lines = list.map((t) => `- ${t.name} (team_id: ${t.id})`).join('\n');
  return `\n\n## Your coach context (use these — never ask for a raw team ID)\nYou staff multiple teams:\n${lines}\nUse the relevant team_id with the team tools directly. Only if it is genuinely ambiguous which team the coach means, ask them to pick by NAME from the list above (never ask for a raw ID).`;
}

/**
 * Build a per-request agent. We don't memoize across requests because
 * the Supabase client closure is request-scoped (RLS depends on the
 * authed user). Async because it injects the coach's team context (one cheap
 * query) so the agent is tailored to whoever is logged in.
 */
export async function buildCoachChatAgent(args: {
  sb: SupabaseClient<Database>;
  authed_user_id: string;
  coach_id: string;
}) {
  const { sb, authed_user_id, coach_id } = args;
  // Tailor the agent to the logged-in coach's team(s) so it never asks for a team ID.
  const teamContext = await resolveCoachTeamContext(sb, coach_id);
  // When the coach's own Anthropic key is present (ANTHROPIC_API_KEY), call Anthropic
  // directly so it's billed to their account; otherwise fall back to the Vercel AI
  // Gateway model string (OIDC + Vercel credits). Same Sonnet 4.6 model either way.
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic('claude-sonnet-4-6')
    : MODEL_FOR_TASK.coach_chat;
  return new ToolLoopAgent({
    model,
    instructions: COACH_CHAT_INSTRUCTIONS + teamContext,
    tools: {
      get_player_context: tool({
        description: 'Fetch one player\'s profile and active goal/round counts.',
        inputSchema: GetPlayerContextInput,
        execute: (input: GetPlayerContextInput) => get_player_context(sb, input),
      }),
      get_player_insights: tool({
        description: 'List a player\'s most recent insights, optionally filtered by category.',
        inputSchema: GetPlayerInsightsInput,
        execute: (input: GetPlayerInsightsInput) => get_player_insights(sb, input),
      }),
      get_player_standing: tool({
        description: 'Get a player\'s current standing rows (PGA delta + team percentile per metric).',
        inputSchema: GetPlayerStandingInput,
        execute: (input: GetPlayerStandingInput) => get_player_standing(sb, input),
      }),
      get_player_recent_rounds: tool({
        description: 'List a player\'s recent completed rounds (score, course, date).',
        inputSchema: GetPlayerRecentRoundsInput,
        execute: (input: GetPlayerRecentRoundsInput) => get_player_recent_rounds(sb, input),
      }),
      compare_players: tool({
        description: 'Side-by-side standing on one metric for two players.',
        inputSchema: ComparePlayersInput,
        execute: (input: ComparePlayersInput) => compare_players(sb, input),
      }),
      get_team_overview: tool({
        description: 'Roster + each player\'s most recent round-to-par for the given team.',
        inputSchema: GetTeamOverviewInput,
        execute: (input: GetTeamOverviewInput) => get_team_overview(sb, input),
      }),
      get_team_patterns: tool({
        description: 'Insights across the team in the last N days grouped by insight_type.',
        inputSchema: GetTeamPatternsInput,
        execute: (input: GetTeamPatternsInput) => get_team_patterns(sb, input),
      }),
      list_player_goals: tool({
        description: 'List a player\'s active goals.',
        inputSchema: ListPlayerGoalsInput,
        execute: (input: ListPlayerGoalsInput) => list_player_goals(sb, input),
      }),
      get_goal_details: tool({
        description: 'Full details + progress snapshots for one goal.',
        inputSchema: GetGoalDetailsInput,
        execute: (input: GetGoalDetailsInput) => get_goal_details(sb, input),
      }),
      create_goal_for_player: tool({
        description:
          'Create a new goal for a player. MUST only be called after the coach has explicitly confirmed in the previous message. The UI will gate this call.',
        inputSchema: CreateGoalForPlayerInput,
        execute: (input: CreateGoalForPlayerInput) =>
          create_goal_for_player(sb, input, authed_user_id, coach_id),
      }),
    },
  });
}
