/**
 * v3 LLM compose() wrapper (W30).
 *
 * The one place that talks to the model. Every LLM call in the v3
 * codebase goes through here so we get a consistent budget gate, call
 * log, and citation-verifier path.
 *
 * Pipeline:
 *   1. Estimate cost using prompt length × model rate.
 *   2. checkBudget() against (coach_id, today). On exhaustion → return
 *      caller-supplied fallback text (used_llm=false).
 *   3. generateText via Vercel AI Gateway using MODEL_FOR_TASK[task].
 *   4. verifyCitations() against the evidence the caller supplied.
 *   5. INSERT a row into golf_coachhelm_llm_calls with token counts +
 *      computed cost + verification status.
 *   6. recordSpend() updates the per-day budget row.
 *   7. Return ComposeResult with text + flags.
 *
 * On generateText error → fall back to template, log a 0-cost row
 * with fallback_to_template=true, and return used_llm=false. The
 * round-review composer's template path is the safety net per Part XI.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateText } from 'ai';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { checkBudget, recordSpend } from './budget';
import { verifyCitations } from './citations';
import type { Json } from '@/lib/types/database';
import {
  MODEL_FOR_TASK,
  estimateCostUsd,
  type ComposeRequest,
  type ComposeResult,
} from './types';

// Rough prompt-token estimate (4 chars per token is the standard rule
// of thumb). Used pre-call to size the budget check; the post-call
// log uses the actual token counts the gateway returns.
function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

/**
 * Hash a prompt for dedup diagnostics. Not used for cache eviction —
 * just lets us see "this prompt got composed 17 times today" when
 * digging through the call log.
 */
async function hashPrompt(prompt: string): Promise<string> {
  // Web Crypto SHA-256 (available in Node 22+ and Edge runtimes).
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prompt));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8) // first 64 bits is plenty for dedup attribution
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function compose(
  req: ComposeRequest,
  fallbackText: string,
): Promise<ComposeResult> {
  const supabase = createAdminClient();
  const model_id = MODEL_FOR_TASK[req.task];
  const prompt_hash = await hashPrompt(req.prompt);
  const promptTokensEstimate = estimatePromptTokens(req.prompt);
  const estimatedCost = estimateCostUsd(model_id, promptTokensEstimate, req.max_completion_tokens);

  // --- 1. Budget gate ---
  // Only enforced when we have a coach to bill against. Some calls
  // (e.g. system jobs) may pass coach_id=null — those bypass the gate
  // but still get logged.
  if (req.coach_id) {
    const gate = await checkBudget(supabase, req.coach_id, estimatedCost);
    if (!gate.allowed) {
      const fallbackId = await logCall(supabase, {
        task: req.task,
        coach_id: req.coach_id,
        player_id: req.player_id,
        prompt_hash,
        model_id,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        citations: { reason: gate.fallback_reason ?? 'budget_gated' },
        verified: false,
        fallback_to_template: true,
      });
      return {
        text: fallbackText,
        used_llm: false,
        citations_verified: false,
        call_log_id: fallbackId,
        cost_usd: 0,
      };
    }
  }

  // --- 2. LLM call ---
  let text: string;
  let prompt_tokens: number;
  let completion_tokens: number;
  try {
    const res = await generateText({
      model: model_id,
      prompt: req.prompt,
      maxOutputTokens: req.max_completion_tokens * 2,
    });
    text = res.text;
    // `usage` is `LanguageModelUsage` with optional inputTokens/outputTokens
    // numbers; widen the inference TS sees on the gateway-string path.
    const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    prompt_tokens = usage?.inputTokens ?? promptTokensEstimate;
    completion_tokens = usage?.outputTokens ?? Math.ceil(text.length / 4);
  } catch (err) {
    // LLM call failed but we have a deterministic fallback ready below —
    // user-facing UX is unaffected. Log as warning (not error) so this
    // shows up in dashboards as observability data rather than as a
    // page-failing exception. Covers rate-limit/budget cases too.
    await logServerEvent(
      `compose() LLM call failed for task=${req.task}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.llm.compose' },
      'warning',
    );
    const fallbackId = await logCall(supabase, {
      task: req.task,
      coach_id: req.coach_id,
      player_id: req.player_id,
      prompt_hash,
      model_id,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      citations: { reason: 'llm_error' },
      verified: false,
      fallback_to_template: true,
    });
    return {
      text: fallbackText,
      used_llm: false,
      citations_verified: false,
      call_log_id: fallbackId,
      cost_usd: 0,
    };
  }

  // --- 3. Verify citations ---
  const verification = verifyCitations(text, req.evidence);
  const cost_usd = estimateCostUsd(model_id, prompt_tokens, completion_tokens);

  // --- 4. Log + record spend ---
  const callLogId = await logCall(supabase, {
    task: req.task,
    coach_id: req.coach_id,
    player_id: req.player_id,
    prompt_hash,
    model_id,
    prompt_tokens,
    completion_tokens,
    cost_usd,
    citations: { unmatched_tokens: verification.unmatched_tokens },
    verified: verification.verified,
    fallback_to_template: false,
  });

  if (req.coach_id) {
    await recordSpend(supabase, {
      coach_id: req.coach_id,
      task: req.task,
      cost_usd,
    });
  }

  return {
    text,
    used_llm: true,
    citations_verified: verification.verified,
    call_log_id: callLogId,
    cost_usd,
  };
}

// ---------------------------------------------------------------------------
// Internal: insert a row into golf_coachhelm_llm_calls.
// ---------------------------------------------------------------------------

type CallLogInput = {
  task: string;
  coach_id: string | null;
  player_id: string | null;
  prompt_hash: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  citations: Record<string, unknown> | null;
  verified: boolean;
  fallback_to_template: boolean;
};

async function logCall(
  supabase: ReturnType<typeof createAdminClient>,
  row: CallLogInput,
): Promise<string | null> {
  // citations is JSON-safe (only string/number/array values) but TS
  // doesn't know that without an explicit Json cast.
  const insertRow = {
    ...row,
    citations: row.citations as unknown as Json,
  };
  const { data, error } = await supabase
    .from('golf_coachhelm_llm_calls')
    .insert(insertRow)
    .select('id')
    .maybeSingle();
  if (error) {
    await logServerError(`logCall failed: ${error.message}`, { action: 'v3.llm.logCall' });
    return null;
  }
  return data?.id ?? null;
}
