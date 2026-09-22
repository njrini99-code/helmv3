/**
 * `runJudgment` — the single entry point every use case goes through.
 *
 *   flag off            → { disposition: 'unassessed', reasonCodes: ['mode_off'] }, zero provider calls
 *   hard invariant      → 'escalate' from the deterministic layer (judgment still recorded for calibration)
 *   provider failure    → 'unassessed' (never 'pass'); nothing throws into the caller
 *   otherwise           → applyPolicy(answers, facts), persisted + telemetry, `shadow` unless enforce
 *
 * Callers in shadow mode must read `result.shadow` and change nothing.
 */

import 'server-only';
import { evaluateWithJev, JEV_PROVIDER } from './jev-provider';
import { hashEntityKey, hashState } from './hashing';
import { persistJudgment } from './persistence';
import { resolveDisposition, resolveMode } from './policy';
import { redactState } from './redact';
import { recordJudgmentTelemetry } from './telemetry';
import type { JudgmentRequest, JudgmentResult, PolicyOutcome } from './types';

const DEFAULT_TIMEOUT_MS = 3_000;

export interface RunJudgmentOptions {
  /** Skip persistence + telemetry (harness/calibration runs). */
  dryRun?: boolean;
  /** Overrides flag-resolved mode (harness/calibration runs only). */
  modeOverride?: 'shadow' | 'enforce';
}

function environmentName(): string {
  return (process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown').slice(0, 32);
}

export async function runJudgment<State>(
  request: JudgmentRequest<State>,
  options: RunJudgmentOptions = {},
): Promise<JudgmentResult> {
  const mode = options.modeOverride ?? resolveMode(request.useCase);
  const base = {
    useCase: request.useCase,
    evaluatorVersion: request.evaluatorVersion,
    policyVersion: request.policyVersion,
    mode,
    provider: JEV_PROVIDER,
    shadow: mode !== 'enforce',
    evaluationId: null,
  } as const;

  if (mode === 'off') {
    const outcome = resolveDisposition(request.facts, null);
    return {
      ...base,
      modelId: 'none',
      answers: {},
      disposition: request.facts.hardInvariantFailed ? outcome.disposition : 'unassessed',
      reasonCodes: request.facts.hardInvariantFailed ? outcome.reasonCodes : ['mode_off', ...(request.facts.reasonCodes ?? [])],
      stateHash: '',
      durationMs: 0,
      providerErrorCode: null,
    };
  }

  const state = redactState(request.state);
  const stateHash = hashState(state);

  let judged: PolicyOutcome | null = null;
  let answers: JudgmentResult['answers'] = {};
  let modelId = 'none';
  let durationMs = 0;
  let providerErrorCode: string | null = null;

  try {
    const provider = await evaluateWithJev(state, request.questions, {
      purpose: request.useCase,
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    durationMs = provider.durationMs;
    if (provider.ok) {
      answers = provider.answers;
      modelId = provider.modelId;
      judged = request.applyPolicy(answers, request.facts);
    } else {
      providerErrorCode = provider.errorCode;
    }
  } catch (error) {
    // applyPolicy is caller code; a bug there is a judgment failure, not a
    // request failure.
    providerErrorCode = error instanceof Error ? `policy_error:${error.name}` : 'policy_error';
    judged = null;
  }

  const outcome = resolveDisposition(request.facts, judged);
  const result: JudgmentResult = {
    ...base,
    modelId,
    answers,
    disposition: outcome.disposition,
    reasonCodes: outcome.reasonCodes,
    stateHash,
    durationMs,
    providerErrorCode,
  };

  if (options.dryRun) return result;

  const evaluationId = await persistJudgment({
    result,
    environment: environmentName(),
    entityType: request.entityType,
    entityKeyHash: request.entityKey ? hashEntityKey(request.entityType, request.entityKey) : null,
    traceId: request.traceId ?? null,
    evidenceSummary: request.evidenceSummary ?? {},
  });
  const persisted = { ...result, evaluationId };
  await recordJudgmentTelemetry(persisted);
  return persisted;
}
