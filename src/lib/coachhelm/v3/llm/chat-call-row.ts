/**
 * The `golf_coachhelm_llm_calls` row for one coach-chat turn.
 *
 * Extracted from `api/coachhelm/v3/chat/stream/route.ts` so the grounding
 * outcome it carries can be unit-tested — `recordTurnCost` is module-private
 * inside a route handler and was not reachable from a test.
 *
 * ── WHY verified WAS ALWAYS FALSE ───────────────────────────────────────────
 *
 * The insert hardcoded `verified: false`. Measured against production
 * 2026-08-18:
 *
 *     task              calls   verified=true   fallback_to_template
 *     hero_narrative      186        141                 39
 *     round_review        121         29                 82
 *     coach_chat           37          0                  0
 *
 * Zero of 37 on both, while the other two tasks populate them. The value was
 * never unknown: the route computes `const grounded = unsupported.length === 0`
 * and uses it twenty lines later to store the message as 'complete' or
 * 'failed'. It just never reached the accounting call.
 *
 * That is not cosmetic. #1474 measures citation discards from `error_logs` and
 * `llm_calls.verified`. On the same day, `golf_coachhelm_chat_messages.status`
 * showed 22 of 47 status-bearing chat replies flagged ungrounded — roughly a
 * 47% discard rate, the worst of the three tasks. Anyone reading the ledger
 * saw 0 and concluded chat was clean. The surface with the biggest problem was
 * the one the instrument could not see.
 */

export interface ChatLlmCallRow {
  task: 'coach_chat';
  coach_id: string;
  /** A chat turn is coach-scoped; it is not about one player. */
  player_id: null;
  prompt_hash: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  citations: null;
  verified: boolean;
  /**
   * Always false, and correct — not an oversight carried over from the old
   * hardcoded row. Chat has no deterministic template to fall back to: when
   * grounding fails it appends UNGROUNDED_NOTE to the model's own text and
   * stores the message as 'failed'. Writing `true` would claim a substitution
   * that never happened, which is exactly the kind of telemetry lie this file
   * exists to stop.
   */
  fallback_to_template: false;
}

export function buildChatLlmCallRow(args: {
  coachId: string;
  conversationId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** `unsupported.length === 0` from the route's numeric-claim audit. */
  grounded: boolean;
}): ChatLlmCallRow {
  return {
    task: 'coach_chat',
    coach_id: args.coachId,
    player_id: null,
    // The conversation id, truncated — deliberately NOT a hash of the prompt.
    // Telemetry carries model, latency and cost; it carries no prompt text,
    // player name or database value.
    prompt_hash: args.conversationId.slice(0, 16),
    model_id: args.modelId,
    prompt_tokens: args.promptTokens,
    completion_tokens: args.completionTokens,
    cost_usd: args.costUsd,
    // Left null until chat's claim audit and round-review's citation set share
    // a shape. Two different structures in one jsonb column would be worse
    // than an honest absence.
    citations: null,
    verified: args.grounded,
    fallback_to_template: false,
  };
}
