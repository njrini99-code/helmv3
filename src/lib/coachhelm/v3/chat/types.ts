/**
 * v3 coach chat — shared types (W32-pt2).
 *
 * One module owns the chat message + conversation shape so the
 * persistence layer, the agent, and the UI all agree.
 */

export type ChatRole = 'user' | 'assistant' | 'tool';

/**
 * Assistant-turn lifecycle. 'complete' = a normal grounded answer; 'failed' =
 * the agent/model errored so the UI renders a visible "couldn't answer" bubble
 * with Retry (never an orphaned user turn). Legacy rows read as 'complete'.
 */
export type ChatMessageStatus = 'complete' | 'failed';

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
  /**
   * Client-supplied idempotency key for the user→assistant exchange. Lets a
   * retried send dedupe instead of creating a second turn. Null on legacy +
   * synthetic tool rows.
   */
  client_turn_id: string | null;
  /** Assistant-turn lifecycle (see {@link ChatMessageStatus}). Null = complete. */
  status: ChatMessageStatus | null;
  /**
   * AI SDK UIMessage parts for this message — text, tool calls, typed data
   * parts (charts, approvals, receipts), entity mentions.
   *
   * `content` alone is only enough to replay the conversation to the MODEL. It
   * is not enough to redraw it for the coach: a reload used to resurrect the
   * prose and silently drop every chart and receipt with it. Persisting the
   * parts is what makes a refreshed thread look like the live one.
   *
   * Null on legacy rows, which render from `content` as before.
   */
  ui_parts: unknown[] | null;
}

/**
 * P1-11 — a question is "data-grounded" when it asks about team/player/stat/
 * pattern/why/compare facts the agent must look up. Such an answer is only
 * trustworthy if at least one tool was actually called; an answer with zero
 * tool calls to one of these questions fails verification and the route falls
 * back to an honest "couldn't ground that" reply instead of an ungrounded one.
 */
const DATA_GROUNDING_PATTERNS: RegExp[] = [
  /\bteam\b/i,
  /\bplayer'?s?\b/i,
  /\broster\b/i,
  /\bstat(s|istic)?\b/i,
  /\bscore(s|d)?\b/i,
  /\bround(s)?\b/i,
  /\bstanding(s)?\b/i,
  /\bpattern(s)?\b/i,
  /\bgoal(s)?\b/i,
  /\binsight(s)?\b/i,
  /\bwhy\b/i,
  /\bcompare|comparison|vs\.?\b/i,
  /\bhandicap\b/i,
  /\bputt(s|ing)?\b/i,
  /\bfairway(s)?\b/i,
  /\bgir\b/i,
  /\bwho (needs|is|are|has)\b/i,
];

/** True when the message text needs tool-grounded data to answer honestly. */
export function requiresDataGrounding(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  return DATA_GROUNDING_PATTERNS.some((re) => re.test(text));
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
