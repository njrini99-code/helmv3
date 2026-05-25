/**
 * v3 LLM-layer shared types (W30).
 *
 * Three task classes per master plan Part XI.1. Each task has a fixed
 * model assignment (Part XI.5 amended 2026-05-25): Haiku for
 * round_review + hero_narrative, Sonnet for coach_chat.
 */

export type ComposeTask = 'round_review' | 'hero_narrative' | 'coach_chat';

/** Vercel AI Gateway model strings — see Part XI.5. */
export const MODEL_FOR_TASK: Record<ComposeTask, string> = {
  round_review: 'anthropic/claude-haiku-4-5',
  hero_narrative: 'anthropic/claude-haiku-4-5',
  coach_chat: 'anthropic/claude-sonnet-4-6',
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
export const MODEL_COST_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-4-5':   { input: 1.0,  output: 5.0  },
  'anthropic/claude-sonnet-4-6':  { input: 3.0,  output: 15.0 },
  'anthropic/claude-opus-4-7':    { input: 15.0, output: 75.0 },
};

export function estimateCostUsd(model_id: string, prompt_tokens: number, completion_tokens: number): number {
  const rates = MODEL_COST_USD_PER_MTOK[model_id];
  if (!rates) return 0;
  return (prompt_tokens / 1_000_000) * rates.input
    + (completion_tokens / 1_000_000) * rates.output;
}
