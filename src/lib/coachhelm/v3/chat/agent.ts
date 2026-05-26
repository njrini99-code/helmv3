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
 * Build a per-request agent. We don't memoize across requests because
 * the Supabase client closure is request-scoped (RLS depends on the
 * authed user). Cheap to instantiate.
 */
export function buildCoachChatAgent(args: {
  sb: SupabaseClient<Database>;
  authed_user_id: string;
  coach_id: string;
}) {
  const { sb, authed_user_id, coach_id } = args;
  return new ToolLoopAgent({
    model: MODEL_FOR_TASK.coach_chat,
    instructions: COACH_CHAT_INSTRUCTIONS,
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
