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

export interface ChatConversation {
  id: string;
  coach_id: string;
  title: string | null;
  pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}
