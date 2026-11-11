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

/** Mirrors `chat/verdict.ts`'s `TurnVerdictReason` (kept local: llm/ does not import chat/). */
export type ChatVerdictReason = 'stream_incomplete' | 'ungrounded_claims' | 'claim_validation_failed';

export interface ChatLlmCallRow {
  task: 'coach_chat';
  /** The coach whose turn it was. Null on a player's own Ask turn, which carries `player_id` instead. */
  coach_id: string | null;
  /** Null on a coach's turn (it is coach-scoped, not about one player). The asking player on a player's own Ask turn. */
  player_id: string | null;
  prompt_hash: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  /**
   * `null` when grounded. Otherwise the same shape compose.ts's own
   * `verification_failed` row uses (compose.ts's `logCall` call in the
   * unrecoverable-verification-failure branch) — the two shapes were kept
   * apart deliberately until chat's claim audit and round-review's citation
   * set shared one, which they now effectively do: both are "the literal
   * text the check could not match". A `failed` chat row with no reason
   * attached is not diagnosable from this table alone; per-occurrence detail
   * in `error_logs` is a queryable metric, not a durable record — retention
   * prunes it, and #1540 was found only because a fresh production query
   * happened to land before that happened.
   */
  citations: {
    /** `grounded` marks a turn the audit accepted, recorded only to keep its citation counts. */
    reason: 'verification_failed' | 'grounded';
    /**
     * Which chat verdict check rejected the turn (audit row 47c). `reason`
     * alone could not tell an ungrounded claim from a dropped stream or a
     * typed-gate rejection. Present only when the caller supplies it, so the
     * shape round_review shares is unchanged.
     */
    verdict_reason?: ChatVerdictReason;
    unmatched_tokens: string[];
    /** Counts of the turn's per-figure citations (cites.ts): figures examined, cited, verified, unresolved, mismatched and the fallback. Recorded for a grounded turn too (reason `grounded`), so the share of answers the citations carried can be read from the ledger. */
    citation_stats?: Record<string, number>;
    /**
     * The optional request features the turn gave up because the API rejected a request that carried them (chat
     * engine, `FEATURE_GROUPS`), in the order it gave them up. Present only on such a turn: a row that has it ran
     * without part of its configuration and is not evidence that the configuration works.
     */
    features_dropped?: string[];
  } | null;
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
  /** Null on a player's own Ask turn. */
  coachId: string | null;
  /** The asking player, on a player's own Ask turn only. */
  playerId?: string | null;
  /** The conversation id, or for a turn that has no stored conversation (a player's Ask) the turn's own id. Opaque either way. */
  conversationId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** `unsupported.length === 0` from the route's numeric-claim audit. */
  grounded: boolean;
  /** The claim texts the audit flagged — e.g. `['71', '-25']`. Ignored when grounded. */
  unmatchedTokens?: string[];
  /** Which verdict check rejected the turn. Ignored when grounded. */
  verdictReason?: ChatVerdictReason;
  /** The turn's citation counts, recorded with the row whether the turn was grounded or not (null `citations` when grounded and there were none). */
  citationStats?: Record<string, number>;
  /** The request feature groups the turn gave up after the API rejected them. Left out or empty on a turn that ran as configured. */
  featuresDropped?: readonly string[];
}): ChatLlmCallRow {
  const dropped = args.featuresDropped && args.featuresDropped.length > 0 ? { features_dropped: [...args.featuresDropped] } : null;
  return {
    task: 'coach_chat',
    coach_id: args.coachId,
    player_id: args.playerId ?? null,
    // The conversation id, truncated — deliberately NOT a hash of the prompt.
    // Telemetry carries model, latency and cost; it carries no prompt text,
    // player name or database value.
    prompt_hash: args.conversationId.slice(0, 16),
    model_id: args.modelId,
    prompt_tokens: args.promptTokens,
    completion_tokens: args.completionTokens,
    cost_usd: args.costUsd,
    // Bare number literals only ('71', '-25') — never the surrounding prose,
    // a player name or a database value. See the ChatLlmCallRow doc comment.
    citations: args.grounded
      ? args.citationStats || dropped
        ? { reason: 'grounded', unmatched_tokens: [], ...(args.citationStats ? { citation_stats: args.citationStats } : {}), ...(dropped ?? {}) }
        : null
      : {
          reason: 'verification_failed',
          ...(args.verdictReason ? { verdict_reason: args.verdictReason } : {}),
          unmatched_tokens: args.unmatchedTokens ?? [],
          ...(args.citationStats ? { citation_stats: args.citationStats } : {}),
          ...(dropped ?? {}),
        },
    verified: args.grounded,
    fallback_to_template: false,
  };
}
