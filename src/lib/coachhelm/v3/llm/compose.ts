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
 *   5. If verification fails, retry ONCE with the unmatched tokens fed
 *      back to the model. If the retry still fails citation
 *      verification, DISCARD the LLM text and fall back to the
 *      caller-supplied template — unverified claims must never reach a
 *      player surface as fact (P0-03).
 *   6. INSERT a row into golf_coachhelm_llm_calls with token counts +
 *      computed cost + verification status.
 *   7. recordSpend() updates the per-day budget row.
 *   8. Return ComposeResult with text + flags.
 *
 * On generateText error → fall back to template, log a 0-cost row
 * with fallback_to_template=true, and return used_llm=false. The
 * round-review composer's template path is the safety net per Part XI.
 *
 * On unrecoverable citation-verification failure → same template
 * fallback, but the log row records `verified=false`,
 * `fallback_to_template=true`, and `citations.reason='verification_failed'`
 * along with the offending unmatched tokens, so the call log keeps the
 * fabricated-cite evidence even though the player never sees the text.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateText } from 'ai';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { checkBudget, recordSpend } from './budget';
import { verifyCitations } from './citations';
import type { Json } from '@/lib/types/database';
import {
  MODEL_FOR_TASK,
  estimateCostUsd,
  type ComposeRequest,
  type ComposeResult,
} from './types';
import { describeError } from '@/lib/utils/describe-error';

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
  // Gate against the HARD cap (runLlmAttempt passes `max_completion_tokens *
  // 2` as maxOutputTokens), not the nominal soft cap — otherwise a citation
  // retry (below) plus a model that runs to its real ceiling can spend
  // roughly double what the gate reserved before the next checkBudget call
  // ever runs.
  const estimatedCost = estimateCostUsd(
    model_id,
    promptTokensEstimate,
    req.max_completion_tokens * 2,
  );

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

  // --- 2. LLM call (with one citation-grounded retry) ---
  // First attempt uses the caller's prompt. If the verifier flags
  // fabricated cites, retry ONCE with the offending tokens fed back so
  // the model can correct itself. Tokens accumulate across attempts so
  // the budget reflects real spend.
  let total_prompt_tokens = 0;
  let total_completion_tokens = 0;

  let attempt: LlmAttempt;
  try {
    attempt = await runLlmAttempt(req, model_id, promptTokensEstimate);
  } catch (err) {
    return await fallbackFromLlmError(supabase, req, fallbackText, {
      prompt_hash,
      model_id,
      err,
    });
  }
  total_prompt_tokens += attempt.prompt_tokens;
  total_completion_tokens += attempt.completion_tokens;

  // --- 3. Verify citations (retry once on failure) ---
  if (!attempt.verification.verified) {
    const retryPrompt = buildRetryPrompt(req.prompt, attempt.verification.unmatched_tokens);
    // The correction retry is a second billable call — re-gate it. Without
    // this, a coach sitting just under their cap could spend roughly double
    // the amount the original gate reserved, since the retry previously ran
    // unconditionally.
    const retryAllowed = req.coach_id
      ? (
          await checkBudget(
            supabase,
            req.coach_id,
            estimateCostUsd(
              model_id,
              estimatePromptTokens(retryPrompt),
              req.max_completion_tokens * 2,
            ),
          )
        ).allowed
      : true;
    if (!retryAllowed) {
      // Denied: fall through with `attempt` left as the unverified attempt-1
      // result. The existing "unrecoverable verification failure" path below
      // already discards it, records only attempt-1's spend, and returns the
      // deterministic fallback — the same outcome as a retry that ran and
      // failed again, just without spending the second call's money.
    } else {
      try {
        const retry = await runLlmAttempt(
          { ...req, prompt: retryPrompt },
          model_id,
          estimatePromptTokens(retryPrompt),
        );
        total_prompt_tokens += retry.prompt_tokens;
        total_completion_tokens += retry.completion_tokens;
        attempt = retry;
      } catch (err) {
        // Retry crashed — count what we already spent on attempt 1 and
        // fall back to the deterministic template.
        return await fallbackFromLlmError(supabase, req, fallbackText, {
          prompt_hash,
          model_id,
          err,
          prompt_tokens: total_prompt_tokens,
          completion_tokens: total_completion_tokens,
        });
      }
    }
  }

  const cost_usd = estimateCostUsd(model_id, total_prompt_tokens, total_completion_tokens);

  // --- 4a. Unrecoverable verification failure → DISCARD LLM text ---
  // The model emitted at least one numeric claim absent from the
  // supplied evidence even after a corrective retry. Surfacing it would
  // show a fabricated number to a player as fact (P0-03), so we throw
  // the LLM text away and return the caller's deterministic fallback.
  // We still bill for the (wasted) tokens and keep the unmatched-token
  // evidence in the call log.
  if (!attempt.verification.verified) {
    await logServerEvent(
      `compose() discarded unverified LLM text for task=${req.task}: unmatched=${attempt.verification.unmatched_tokens.join(',')}`,
      { action: 'v3.llm.compose' },
      'warning',
    );
    const fallbackId = await logCall(supabase, {
      task: req.task,
      coach_id: req.coach_id,
      player_id: req.player_id,
      prompt_hash,
      model_id,
      prompt_tokens: total_prompt_tokens,
      completion_tokens: total_completion_tokens,
      cost_usd,
      citations: {
        reason: 'verification_failed',
        unmatched_tokens: attempt.verification.unmatched_tokens,
      },
      verified: false,
      fallback_to_template: true,
    });
    if (req.coach_id) {
      await recordSpend(supabase, { coach_id: req.coach_id, task: req.task, cost_usd });
    }
    return {
      text: fallbackText,
      used_llm: false,
      citations_verified: false,
      call_log_id: fallbackId,
      cost_usd,
    };
  }

  // --- 4b. Verified → log, record spend, return the LLM prose ---
  const callLogId = await logCall(supabase, {
    task: req.task,
    coach_id: req.coach_id,
    player_id: req.player_id,
    prompt_hash,
    model_id,
    prompt_tokens: total_prompt_tokens,
    completion_tokens: total_completion_tokens,
    cost_usd,
    citations: { unmatched_tokens: attempt.verification.unmatched_tokens },
    verified: true,
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
    text: attempt.text,
    used_llm: true,
    citations_verified: true,
    call_log_id: callLogId,
    cost_usd,
  };
}

// ---------------------------------------------------------------------------
// Internal: one generate-and-verify pass.
// ---------------------------------------------------------------------------

interface LlmAttempt {
  text: string;
  prompt_tokens: number;
  completion_tokens: number;
  verification: ReturnType<typeof verifyCitations>;
}

async function runLlmAttempt(
  req: ComposeRequest,
  model_id: string,
  promptTokensEstimate: number,
): Promise<LlmAttempt> {
  const res = await generateText({
    model: model_id,
    prompt: req.prompt,
    maxOutputTokens: req.max_completion_tokens * 2,
  });
  const text = res.text;
  // `usage` is `LanguageModelUsage` with optional inputTokens/outputTokens
  // numbers; widen the inference TS sees on the gateway-string path.
  const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  const prompt_tokens = usage?.inputTokens ?? promptTokensEstimate;
  const completion_tokens = usage?.outputTokens ?? Math.ceil(text.length / 4);
  return {
    text,
    prompt_tokens,
    completion_tokens,
    verification: verifyCitations(text, req.evidence),
  };
}

/**
 * Append corrective feedback naming the unmatched tokens so the retry
 * attempt can drop or fix the fabricated numbers.
 */
function buildRetryPrompt(prompt: string, unmatchedTokens: string[]): string {
  const tokenList = unmatchedTokens.join(', ');
  return (
    `${prompt}\n\n` +
    `IMPORTANT CORRECTION: a previous draft included numbers that are NOT ` +
    `supported by the provided data: ${tokenList}. Rewrite the response and ` +
    `do NOT mention any number unless it appears in the supplied evidence. ` +
    `Use directional words ("up", "down", "improved") instead of inventing figures.`
  );
}

/**
 * Report one compose() failure.
 *
 * Two things are normalised here. The message: the Vercel AI Gateway's
 * out-of-credit body carries a per-team billing URL, which the incident
 * signature hashes verbatim, so one outage arrived as several incidents. And
 * the code: a stable `provider_*` code ties this row to the same fault the chat
 * route reports, so an operator sees one cause rather than one row per feature.
 *
 * Severity stays 'warning' even for an operator-blocking fault, unlike the chat
 * route's 'error'. That is deliberate and is the honest difference between the
 * two: compose() has a deterministic template behind it, so the player still
 * receives a real (if plainer) round review, whereas a failed chat turn leaves
 * the coach with nothing. Degraded is not down.
 */
async function logComposeFailure(task: string, err: unknown): Promise<void> {
  const fault = classifyProviderFault(err);
  if (!fault) {
    await logServerEvent(
      `compose() LLM call failed for task=${task}: ${describeError(err)}`,
      { action: 'v3.llm.compose' },
      'warning',
    );
    return;
  }

  const throttleKey = `compose-provider:${fault.code}`;
  if (!shouldEmit(throttleKey)) return;
  const collapsed = drainCollapsedCount(throttleKey);

  await logServerEvent(
    `compose() fell back to the template: ${fault.summary}`,
    {
      action: 'v3.llm.compose',
      errorCode: fault.code,
      skipSentry: providerFaultSeverity(fault).skipSentry,
      extra: {
        task,
        providerFaultKind: fault.kind,
        provider: fault.provider,
        providerMessage: describeError(err).slice(0, 500),
        ...(collapsed > 0 ? { collapsed_count: collapsed } : {}),
      },
    },
    'warning',
  );
}

/**
 * Shared fallback path when generateText throws (rate limit, gateway
 * error, etc.). Logs a warning + a 0-or-partial-cost row and returns the
 * deterministic template, never surfacing the failure to the player.
 */
async function fallbackFromLlmError(
  supabase: ReturnType<typeof createAdminClient>,
  req: ComposeRequest,
  fallbackText: string,
  ctx: {
    prompt_hash: string;
    model_id: string;
    err: unknown;
    prompt_tokens?: number;
    completion_tokens?: number;
  },
): Promise<ComposeResult> {
  await logComposeFailure(req.task, ctx.err);
  const prompt_tokens = ctx.prompt_tokens ?? 0;
  const completion_tokens = ctx.completion_tokens ?? 0;
  const cost_usd = estimateCostUsd(ctx.model_id, prompt_tokens, completion_tokens);
  const fallbackId = await logCall(supabase, {
    task: req.task,
    coach_id: req.coach_id,
    player_id: req.player_id,
    prompt_hash: ctx.prompt_hash,
    model_id: ctx.model_id,
    prompt_tokens,
    completion_tokens,
    cost_usd,
    citations: { reason: 'llm_error' },
    verified: false,
    fallback_to_template: true,
  });
  if (req.coach_id && cost_usd > 0) {
    await recordSpend(supabase, { coach_id: req.coach_id, task: req.task, cost_usd });
  }
  return {
    text: fallbackText,
    used_llm: false,
    citations_verified: false,
    call_log_id: fallbackId,
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
