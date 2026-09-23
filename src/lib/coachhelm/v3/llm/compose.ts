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
 *   4a. Package 8 slice 1 (repair plan 14.10): when the caller supplies
 *      `evidence_packet`, the prompt also asks for a structured claims
 *      block, which is parsed and run through claim-validator.ts's
 *      validateClaims() as an EXTRA gate — it catches a real evidence
 *      value cited under the wrong metric/player/window, which the flat
 *      numeric scan in step 4 cannot see. The numeric scan stays wired
 *      as defense in depth for callers with and without a packet. The
 *      claims block itself is always stripped before the text is
 *      verified or returned — it must never reach a player.
 *   5. If EITHER gate fails, retry ONCE with the unmatched tokens and/or
 *      rejected-claim reasons fed back to the model. If the retry still
 *      fails, DISCARD the LLM text and fall back to the caller-supplied
 *      template — unverified claims must never reach a player surface
 *      as fact (P0-03).
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
 * (or `'claim_validation_failed'` when the typed gate is what failed)
 * along with the offending unmatched tokens / rejected claims, so the
 * call log keeps the fabricated-cite evidence even though the player
 * never sees the text.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { generateText } from 'ai';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { z } from 'zod';
import { checkBudget, recordSpend } from './budget';
import { verifyCitations } from './citations';
import { validateClaims, type ClaimReference, type RejectedClaim } from './claim-validator';
import type { Json } from '@/lib/types/database';
import {
  MODEL_FOR_TASK,
  estimateCostUsd,
  type ComposeRequest,
  type ComposeResult,
} from './types';
import { describeError } from '@/lib/utils/describe-error';
import { recordAi } from '@/lib/observability/metrics';

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
  // First attempt uses the caller's prompt (plus the claims-block
  // instruction when a typed evidence packet was supplied). If either
  // gate flags a problem, retry ONCE with the offending tokens/claims fed
  // back so the model can correct itself. Tokens accumulate across
  // attempts so the budget reflects real spend.
  let total_prompt_tokens = 0;
  let total_completion_tokens = 0;

  const promptWithClaims = req.evidence_packet
    ? `${req.prompt}${buildClaimsInstruction(req.evidence_packet)}`
    : req.prompt;

  let attempt: LlmAttempt;
  try {
    attempt = await runLlmAttempt({ ...req, prompt: promptWithClaims }, model_id, promptTokensEstimate);
  } catch (err) {
    return await fallbackFromLlmError(supabase, req, fallbackText, {
      prompt_hash,
      model_id,
      err,
    });
  }
  total_prompt_tokens += attempt.prompt_tokens;
  total_completion_tokens += attempt.completion_tokens;

  // --- 3. Verify citations + typed claims (retry once on failure) ---
  if (!attemptVerified(attempt)) {
    const retryPrompt = buildRetryPrompt(
      promptWithClaims,
      attempt.verification.unmatched_tokens,
      attempt.claims?.rejected,
      attempt.claims?.malformed ?? false,
    );
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
  // The model emitted at least one numeric claim absent from the supplied
  // evidence, or (Package 8 slice 1) a typed claim that misattributed a
  // real value, even after a corrective retry. Surfacing it would show a
  // fabricated or misattributed claim to a player as fact (P0-03), so we
  // throw the LLM text away and return the caller's deterministic
  // fallback. We still bill for the (wasted) tokens and keep the
  // rejection evidence in the call log.
  if (!attemptVerified(attempt)) {
    const claimReasonSummary = (attempt.claims?.rejected ?? [])
      .map((r) => `${r.claim.metric_id}:${r.reason}`)
      .join(',');
    await logServerEvent(
      `compose() discarded unverified LLM text for task=${req.task}: ` +
        `unmatched=${attempt.verification.unmatched_tokens.join(',')}` +
        (attempt.claims ? ` claims=${claimReasonSummary || (attempt.claims.malformed ? 'malformed' : 'none')}` : ''),
      { action: 'v3.llm.compose' },
      'warning',
    );
    // Prefer the typed-gate reason when it's the one that failed — it is
    // strictly more diagnosable (names the metric and why) than the flat
    // numeric-scan reason.
    const typedGateFailed = attempt.claims !== null && (attempt.claims.malformed || attempt.claims.rejected.length > 0);
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
        reason: typedGateFailed ? 'claim_validation_failed' : 'verification_failed',
        unmatched_tokens: attempt.verification.unmatched_tokens,
        // The values that WERE allowed. Without these a discard is not
        // diagnosable: the row says what was rejected but not what it was
        // checked against, so you cannot tell a fabricated number from a
        // legitimate one whose claim was missing.
        //
        // Measured 2026-08-16, which is why this exists: 19 of 107
        // round_review calls had been discarded, and the leftover tokens
        // correlated exactly with the player's round `total_putts` and
        // `total_score` — values that ARE unconditional claims. Whether the
        // input carried them, or the reviewed round differed from the one the
        // token came from, was UNANSWERABLE from the log. It still needed a
        // guess after an hour of joins against golf_rounds.
        //
        // Fields + values only. No prose, no prompt, no completion — this
        // lands in `golf_coachhelm_llm_calls.citations` next to a player_id,
        // so it stays the same class of data the row already holds.
        evidence_offered: req.evidence.map((e) => ({ field: e.field, value: e.value })),
        // Package 8 slice 1: {claim_id, metric_id, reason} only — no prose,
        // mirroring evidence_offered's own no-prose contract.
        ...(attempt.claims
          ? {
              claim_validation: {
                malformed: attempt.claims.malformed,
                rejected: attempt.claims.rejected.map((r) => ({
                  claim_id: r.claim.claim_id,
                  metric_id: r.claim.metric_id,
                  reason: r.reason,
                })),
              },
            }
          : {}),
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
    citations: {
      unmatched_tokens: attempt.verification.unmatched_tokens,
      // SHOULD-5 (post-#1991 review): a successful call with a typed
      // packet previously logged nothing about the typed gate at all —
      // only a discard told you claim-validator.ts ran. Recording the
      // accepted count on every packet-engaged call (rejected is always
      // 0 here, by construction of reaching this branch) makes "was the
      // typed gate even exercised" answerable without cross-referencing
      // discards.
      ...(attempt.claims
        ? { claim_validation: { accepted: attempt.claims.accepted.length, rejected: 0 } }
        : {}),
    },
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

interface TypedClaimAttempt {
  accepted: ClaimReference[];
  rejected: RejectedClaim[];
  /** True when the claims block was absent or failed to parse. Distinct
   *  from a plain rejection: nothing here names a specific bad claim. */
  malformed: boolean;
}

interface LlmAttempt {
  /** Model prose with the claims block (if any) already stripped out —
   *  this is the ONLY text that reaches verifyCitations, validateClaims,
   *  or a player. The raw block must never survive past this point. */
  text: string;
  prompt_tokens: number;
  completion_tokens: number;
  verification: ReturnType<typeof verifyCitations>;
  /** Null when the caller supplied no `evidence_packet` — the typed gate
   *  is opt-in and simply isn't evaluated for that request. */
  claims: TypedClaimAttempt | null;
}

/** True when BOTH the legacy numeric scan and (if engaged) the typed
 *  claim gate are satisfied. Either gate failing means the text must not
 *  render. */
function attemptVerified(attempt: LlmAttempt): boolean {
  if (!attempt.verification.verified) return false;
  if (attempt.claims && (attempt.claims.malformed || attempt.claims.rejected.length > 0)) return false;
  return true;
}

const CLAIMS_OPEN = '<<<CLAIMS>>>';
const CLAIMS_CLOSE = '<<<END_CLAIMS>>>';
const CLAIMS_BLOCK_RE = /<<<CLAIMS>>>([\s\S]*?)<<<END_CLAIMS>>>/;

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Remove every claims-block delimiter from `text`, however many there
 * are: every complete `<<<CLAIMS>>>...<<<END_CLAIMS>>>` pair (global, not
 * just the first — MUST-1 post-#1991 review: without `/g` a SECOND block
 * survived a `.replace()` into player text), everything from an
 * unterminated opener through the end of the string, and any stray
 * closer with no matching opener. Called on every malformed path so a
 * duplicated or broken claims block can never leave a literal delimiter
 * or a raw JSON fragment in text a player reads.
 */
function stripAllClaimsDelimiters(text: string): string {
  let out = text.replace(new RegExp(CLAIMS_BLOCK_RE.source, 'g'), '');
  const openIdx = out.indexOf(CLAIMS_OPEN);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  out = out.split(CLAIMS_CLOSE).join('');
  return out.trim();
}

const ClaimReferenceSchema = z.object({
  claim_id: z.string(),
  metric_id: z.string(),
  value: z.number(),
  player_id: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  claim_type: z.enum(['fact', 'causal']).optional(),
});
const ClaimsBlockSchema = z.array(ClaimReferenceSchema);

/**
 * Ask the model to append a structured claims block naming every
 * factual/causal number it cites, in addition to writing normal prose.
 * The block is parsed with zod `safeParse` — never the AI SDK's
 * structured-output API, since this rides alongside free-text generation
 * rather than replacing it — and is ALWAYS stripped before the text is
 * checked or returned (see `stripClaimsBlock`).
 */
function buildClaimsInstruction(packet: NonNullable<ComposeRequest['evidence_packet']>): string {
  return (
    `\n\nAfter your response, append a claims block listing EVERY factual ` +
    `or causal number you cited, in exactly this format:\n` +
    `<<<CLAIMS>>>\n` +
    `[{"claim_id":"c1","metric_id":"<metric id>","value":<number>,` +
    `"player_id":"${packet.player_id}","window_start":"${packet.window_start}",` +
    `"window_end":"${packet.window_end}","claim_type":"fact"}]\n` +
    `<<<END_CLAIMS>>>\n` +
    `Set "claim_type":"causal" only when asserting a CAUSE, not a plain fact. ` +
    `The block must be valid JSON and is removed before anyone sees your ` +
    `response — it does not need to read naturally.`
  );
}

/**
 * Strip the claims block (delimiters included) out of the raw model text
 * and parse it, when present, against `evidence_packet`. Never throws —
 * a missing, duplicated, unterminated, or invalid-JSON/-schema block
 * comes back as `malformed: true` rather than an exception, matching
 * compose()'s contract that a provider or parsing problem never surfaces
 * past this module.
 *
 * More than one opener or closer (a duplicated block) and an opener with
 * no matching closer (an unterminated block) are BOTH malformed, not "use
 * the first one" — MUST-1 (post-#1991 review): a second, unparsed block
 * must never reach a player as literal text.
 */
function extractAndValidateClaims(
  rawText: string,
  packet: ComposeRequest['evidence_packet'],
): { strippedText: string; claims: TypedClaimAttempt | null } {
  if (!packet) return { strippedText: rawText, claims: null };

  const strippedText = stripAllClaimsDelimiters(rawText);
  const openCount = countOccurrences(rawText, CLAIMS_OPEN);
  const closeCount = countOccurrences(rawText, CLAIMS_CLOSE);
  if (openCount !== 1 || closeCount !== 1) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  // Exactly one opener and one closer exist, but they could still be in
  // the wrong order (closer before opener) — `.match` returns null in
  // that case rather than a false match, so this guard is load-bearing,
  // not defensive dead code.
  const match = rawText.match(CLAIMS_BLOCK_RE);
  if (!match) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? '');
  } catch {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  const result = ClaimsBlockSchema.safeParse(parsed);
  if (!result.success) {
    return { strippedText, claims: { accepted: [], rejected: [], malformed: true } };
  }

  const validated = validateClaims(result.data, packet, strippedText);
  return {
    strippedText,
    claims: { accepted: validated.accepted, rejected: validated.rejected, malformed: false },
  };
}

async function runLlmAttempt(
  req: ComposeRequest,
  model_id: string,
  promptTokensEstimate: number,
): Promise<LlmAttempt> {
  const startedAt = Date.now();
  let res: Awaited<ReturnType<typeof generateText>>;
  try {
    // Direct Anthropic when the key is set, else the gateway string.
    // `model_id` stays gateway-prefixed everywhere else in this function —
    // the cost table, checkBudget and the call-log row are all keyed by it.
    // See @/lib/ai/model-provider for what these two accounts are.
    res = await generateText({
      model: resolveModelProvider(model_id),
      prompt: req.prompt,
      maxOutputTokens: req.max_completion_tokens * 2,
      // Sentry AI observability opt-in (Phase A finding, §(a)): compose()
      // is the ONE choke point every v3 LLM call in this codebase routes
      // through — round review, hero narrative, coach chat's own
      // composers. `req.prompt` can carry a player's first name (Phase A's
      // own example: hero-narrative.ts builds it into the prompt text
      // directly) and evidence values from the round/player's own data.
      // No prompt or completion belongs in Sentry from any of them.
      experimental_telemetry: {
        isEnabled: true,
        functionId: `coachhelm.compose.${req.task}`,
        recordInputs: false,
        recordOutputs: false,
      },
    });
  } catch (error) {
    recordAi({
      feature: 'coachhelm_compose',
      action: `v3.llm.compose.${req.task}`,
      model: model_id,
      outcome: 'failure',
      durationMs: Date.now() - startedAt,
      errorCode: classifyProviderFault(error)?.code,
      runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    });
    throw error;
  }

  const rawText = res.text;
  // `usage` is `LanguageModelUsage` with optional inputTokens/outputTokens
  // numbers; widen the inference TS sees on the gateway-string path.
  const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  const prompt_tokens = usage?.inputTokens ?? promptTokensEstimate;
  const completion_tokens = usage?.outputTokens ?? Math.ceil(rawText.length / 4);

  recordAi({
    feature: 'coachhelm_compose',
    action: `v3.llm.compose.${req.task}`,
    model: model_id,
    outcome: 'success',
    durationMs: Date.now() - startedAt,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
  });

  // Strip the claims block (if any) BEFORE either verifier sees the text —
  // it must never reach verifyCitations, validateClaims, or a player.
  const { strippedText, claims } = extractAndValidateClaims(rawText, req.evidence_packet);

  return {
    text: strippedText,
    prompt_tokens,
    completion_tokens,
    verification: verifyCitations(strippedText, req.evidence),
    claims,
  };
}

/**
 * Append corrective feedback naming the unmatched tokens and/or rejected
 * typed claims so the retry attempt can drop or fix them. `prompt` is
 * already the base prompt including the claims-block instruction (when
 * engaged), so the retry keeps asking for the block too.
 *
 * MUST-2 (post-#1991 review): with no `evidence_packet`, this must
 * return BYTE-IDENTICAL output to the original single-purpose function —
 * `${prompt}\n\n${correction}`, no trailing newline. Sections are joined
 * with `\n` and only a leading `${prompt}\n\n` is ever added, so the
 * single-section (default, no-packet) case reduces to exactly that.
 */
function buildRetryPrompt(
  prompt: string,
  unmatchedTokens: string[],
  rejectedClaims: RejectedClaim[] | undefined,
  malformed: boolean,
): string {
  const sections: string[] = [];

  if (unmatchedTokens.length > 0) {
    const tokenList = unmatchedTokens.join(', ');
    sections.push(
      `IMPORTANT CORRECTION: a previous draft included numbers that are NOT ` +
        `supported by the provided data: ${tokenList}. Rewrite the response and ` +
        `do NOT mention any number unless it appears in the supplied evidence. ` +
        `Use directional words ("up", "down", "improved") instead of inventing figures.`,
    );
  }

  if (malformed) {
    sections.push(
      `IMPORTANT CORRECTION: your claims block was missing, duplicated, unterminated, ` +
        `or was not valid JSON. You MUST include EXACTLY ONE claims block, in exactly ` +
        `the format shown, listing every number you cite.`,
    );
  } else if (rejectedClaims && rejectedClaims.length > 0) {
    const issues = rejectedClaims
      .map((r) => `metric_id=${r.claim.metric_id || '(none)'} value=${r.claim.value} reason=${r.reason}`)
      .join('; ');
    sections.push(
      `IMPORTANT CORRECTION: some of your cited claims could not be verified against ` +
        `the evidence for this player and window: ${issues}. Only cite a metric's own ` +
        `value, for this exact player and window, and only assert a cause when the ` +
        `evidence supports it. Rewrite the response and its claims block accordingly.`,
    );
  }

  if (sections.length === 0) return prompt;
  return `${prompt}\n\n${sections.join('\n')}`;
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

// ---------------------------------------------------------------------------
// Test surface — exported for unit tests in compose.test.ts. Production
// callers should use compose() above.
// ---------------------------------------------------------------------------

export const __testables = {
  buildRetryPrompt,
  extractAndValidateClaims,
  stripAllClaimsDelimiters,
};
