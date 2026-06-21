/**
 * v3 coach chat — shared types (W32-pt2).
 *
 * One module owns the chat message + conversation shape so the
 * persistence layer, the agent, and the UI all agree.
 */

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string | null;
  /** Assistant rows may carry tool_calls (LLM asked to call N tools). */
  tool_calls: ToolCallRecord[] | null;
  /** Tool rows carry tool_results (one record per call). */
  tool_results: ToolResultRecord[] | null;
  cost_usd: number | null;
  created_at: string;
}

export interface ToolCallRecord {
  tool_call_id: string;
  name: string;
  /** Stringified JSON args for ergonomic display. */
  arguments: string;
}

export interface ToolResultRecord {
  tool_call_id: string;
  name: string;
  /** Raw tool output — what the agent received back. */
  result: unknown;
  error?: string;
}

/**
 * A goal the agent has PROPOSED but NOT created. The one mutating chat tool
 * (`create_goal_for_player`) never writes to the DB — it returns this shape so
 * the UI can render a Confirm/Cancel card. Only an explicit coach "Confirm"
 * click runs the real `createGoal` server action (auth-checked + RLS-gated).
 * This is the load-bearing gate: a model misfire or prompt-injected "yes" can
 * surface a proposal card, but it can NEVER create a row on its own.
 */
export interface GoalProposal {
  kind: 'create_goal';
  player_id: string;
  /** Resolved active team for the player — required by the confirm action's RLS. */
  team_id: string;
  /** Display name for the card; the agent already looked this up. */
  player_name: string | null;
  metric_id: string;
  title: string;
  target_value: number;
  window_days: number;
  coach_assignment_mode: 'mandatory' | 'suggested';
}

/** Type guard for a goal-creation proposal embedded in a tool result. */
export function isGoalProposal(value: unknown): value is GoalProposal {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === 'create_goal' &&
    typeof v.player_id === 'string' &&
    typeof v.team_id === 'string' &&
    typeof v.metric_id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.target_value === 'number' &&
    typeof v.window_days === 'number' &&
    (v.coach_assignment_mode === 'mandatory' || v.coach_assignment_mode === 'suggested')
  );
}

export interface ChatConversation {
  id: string;
  coach_id: string;
  title: string | null;
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
