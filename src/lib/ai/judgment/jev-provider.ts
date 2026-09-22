/**
 * The one place Jev's native answer shapes are seen. Transport is
 * `src/lib/typesafe/client.ts` (direct api.typesafe.ai, `TYPESAFE_API_KEY`);
 * this module turns SDK answers into `NormalizedAnswer`s and reports
 * failures as codes rather than throwing.
 *
 * Why not Vercel AI Gateway's `typesafe-ai/jev`: the installed `ai` SDK
 * (7.0.79) predates `experimental_evaluate` (7.0.105+), and the gateway
 * account has already served template fallbacks once when it was on the free
 * tier (see src/lib/ai/model-provider.ts). Swapping the transport later is
 * this file only.
 */

import 'server-only';
import type { Questions } from '@typesafe-ai/sdk';
import { askJev, isTypeSafeConfigured, TYPESAFE_MODEL } from '@/lib/typesafe/client';
import type { NormalizedAnswer, NormalizedAnswers } from './types';

export const JEV_PROVIDER = 'typesafe-ai' as const;

export interface ProviderSuccess {
  ok: true;
  answers: NormalizedAnswers;
  modelId: string;
  durationMs: number;
}

export interface ProviderFailure {
  ok: false;
  /** `not_configured` | `provider_error` (transport/API; details already logged). */
  errorCode: 'not_configured' | 'provider_error';
  durationMs: number;
}

export function normalizeAnswer(raw: unknown): NormalizedAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'noul' && typeof a.noul === 'number') return { kind: 'noul', p: clamp(a.noul) };
  if (a.type === 'choice' && typeof a.choice === 'string') {
    return {
      kind: 'choice',
      choice: a.choice,
      confidence: clamp(Number(a.confidence ?? 0)),
      probabilities: numericRecord(a.probabilities),
    };
  }
  if (a.type === 'score' && typeof a.score === 'number') {
    return {
      kind: 'score',
      score: a.score,
      confidence: clamp(Number(a.confidence ?? 0)),
      probabilities: numericRecord(a.probabilities),
    };
  }
  return null;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function numericRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'number') out[k] = clamp(v);
    }
  }
  return out;
}

export async function evaluateWithJev(
  state: unknown,
  questions: Record<string, unknown>,
  opts: { purpose: string; timeoutMs?: number },
): Promise<ProviderSuccess | ProviderFailure> {
  const started = Date.now();
  if (!isTypeSafeConfigured()) return { ok: false, errorCode: 'not_configured', durationMs: 0 };
  const result = await askJev(
    state as Parameters<typeof askJev>[0],
    questions as Questions,
    { purpose: opts.purpose, timeoutMs: opts.timeoutMs },
  );
  const durationMs = Date.now() - started;
  if (!result) return { ok: false, errorCode: 'provider_error', durationMs };
  const answers: NormalizedAnswers = {};
  for (const [id, raw] of Object.entries(result.answers as Record<string, unknown>)) {
    const normalized = normalizeAnswer(raw);
    if (normalized) answers[id] = normalized;
  }
  // A response with none of the asked questions answered is a provider
  // fault, not an opinion.
  if (Object.keys(answers).length === 0) return { ok: false, errorCode: 'provider_error', durationMs };
  return { ok: true, answers, modelId: result.model || TYPESAFE_MODEL, durationMs };
}
