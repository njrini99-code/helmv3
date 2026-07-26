/**
 * v3 LLM-layer shared types (W30).
 *
 * Three task classes per master plan Part XI.1. Each task has a fixed
 * model assignment (Part XI.5 amended 2026-05-25): Haiku for
 * round_review + hero_narrative, Sonnet for coach_chat.
 *
 * 2026-07-25 — coach_chat moved to Sonnet 5. The chat agent is the one task
 * that runs a multi-step tool loop and has to reason about which reads to make
 * before answering, so it is the task that benefits most from the newer model.
 */

export type ComposeTask = 'round_review' | 'hero_narrative' | 'coach_chat';

/** Vercel AI Gateway model strings — see Part XI.5. */
export const MODEL_FOR_TASK: Record<ComposeTask, string> = {
  round_review: 'anthropic/claude-haiku-4-5',
  hero_narrative: 'anthropic/claude-haiku-4-5',
  coach_chat: 'anthropic/claude-sonnet-5',
};

/**
 * Per-task fallback priority on budget exhaustion (Part XI.4).
 * Lower number = higher priority (stays on LLM longer).
 *   round_review (1) > coach_chat (2) > hero_narrative (3)
 */
export const FALLBACK_PRIORITY: Record<ComposeTask, number> = {
  round_review: 1,
  coach_chat: 2,
  hero_narrative: 3,
};

export interface ComposeRequest {
  task: ComposeTask;
  coach_id: string | null;
  player_id: string | null;
  /** Prompt template + variables resolved by the task-specific composer. */
  prompt: string;
  /** Evidence the model is asked to cite. The verifier checks the model
   *  only mentions field/value pairs that appear in this list. */
  evidence: EvidenceClaim[];
  /** Soft cap on completion tokens. Hard cap = 2× this in the model call. */
  max_completion_tokens: number;
}

export interface EvidenceClaim {
  field: string;
  value: string | number;
}

export interface ComposeResult {
  text: string;
  /** True when the model went through the LLM path; false when it
   *  fell back to the caller-supplied template due to budget or error. */
  used_llm: boolean;
  /** True when every claim cite()'d by the model was present in
   *  request.evidence. False = at least one fabricated cite — caller
   *  decides whether to surface anyway. */
  citations_verified: boolean;
  /** The id of the row inserted into golf_coachhelm_llm_calls. Null
   *  for fallback (no LLM call was made). */
  call_log_id: string | null;
  cost_usd: number;
}

/**
 * Approximate per-token cost for the models we use. Used by the
 * compose wrapper to compute cost_usd before logging.
 * Source: Anthropic pricing 2026-Q1 via Vercel AI Gateway.
 */
const MODEL_COST_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-4-5':   { input: 1.0,  output: 5.0  },
  'anthropic/claude-sonnet-4-6':  { input: 3.0,  output: 15.0 },
  // Sonnet 5 — carried at the standing Sonnet tier. VERIFY against current
  // published pricing before relying on the spend figures for billing; the
  // budget gate is only as accurate as this table.
  'anthropic/claude-sonnet-5':    { input: 3.0,  output: 15.0 },
  'anthropic/claude-opus-4-7':    { input: 15.0, output: 75.0 },
};

/**
 * Conservative rate for a model that is not in the table.
 *
 * This used to return 0, which is the worst possible default: an unpriced model
 * bills nothing, `checkBudget` never sees spend accumulate, and the daily cap
 * silently stops existing. The failure mode of guessing HIGH is that a coach
 * runs out of budget early and someone notices; the failure mode of guessing
 * zero is an uncapped bill nobody notices. Priced at the Opus tier so an
 * unrecognised model is always over- rather than under-charged.
 */
const UNKNOWN_MODEL_RATE = { input: 15.0, output: 75.0 } as const;

/** True when the model has a real published rate rather than the fallback. */
export function hasKnownPricing(model_id: string): boolean {
  return model_id in MODEL_COST_USD_PER_MTOK;
}

export function estimateCostUsd(model_id: string, prompt_tokens: number, completion_tokens: number): number {
  const rates = MODEL_COST_USD_PER_MTOK[model_id] ?? UNKNOWN_MODEL_RATE;
  return (prompt_tokens / 1_000_000) * rates.input
    + (completion_tokens / 1_000_000) * rates.output;
}

/**
 * Anthropic's cache multipliers, applied to the model's own input rate.
 * Writing a cache entry costs a premium; reading one is nearly free.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** The cache split of one call's input tokens, as the AI SDK reports it. */
export interface InputTokenDetails {
  noCacheTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Cost for a call that used prompt caching.
 *
 * `prompt_tokens` is the TOTAL and already contains the cached portions — the
 * SDK documents `inputTokens` as the total and `inputTokenDetails` as its
 * breakdown into `noCacheTokens + cacheReadTokens + cacheWriteTokens`. Pricing
 * that total at the full input rate is what `estimateCostUsd` does, and once
 * caching is switched on it becomes an overcharge: a cache READ costs a tenth
 * of a fresh token, so the ledger would bill ~10x for the majority of a cached
 * turn's prefix and burn a coach's daily budget on spend that never happened.
 *
 * Falls back to the uncached figure when the provider reports no breakdown, so
 * a model or gateway that does not surface cache details is unaffected.
 */
export function estimateCachedCostUsd(
  model_id: string,
  prompt_tokens: number,
  completion_tokens: number,
  details?: InputTokenDetails,
): number {
  const cacheRead = details?.cacheReadTokens ?? 0;
  const cacheWrite = details?.cacheWriteTokens ?? 0;
  if (cacheRead === 0 && cacheWrite === 0) {
    return estimateCostUsd(model_id, prompt_tokens, completion_tokens);
  }

  const rates = MODEL_COST_USD_PER_MTOK[model_id] ?? UNKNOWN_MODEL_RATE;
  // Prefer the provider's own uncached count; derive it only if absent, and
  // never let a mismatch drive it negative.
  const fresh = details?.noCacheTokens ?? Math.max(0, prompt_tokens - cacheRead - cacheWrite);

  return (
    (fresh / 1_000_000) * rates.input +
    (cacheWrite / 1_000_000) * rates.input * CACHE_WRITE_MULTIPLIER +
    (cacheRead / 1_000_000) * rates.input * CACHE_READ_MULTIPLIER +
    (completion_tokens / 1_000_000) * rates.output
  );
}
