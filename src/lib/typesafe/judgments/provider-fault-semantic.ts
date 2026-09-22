/**
 * Semantic fallback for `classifyProviderFault`.
 *
 * The regex classifier stays synchronous and authoritative: it runs inside
 * `onError` handlers and must work when the network is the thing that is
 * broken. This async judgment is ADDITIVE — consulted only for the `null`
 * (no rule matched) case in offline triage, so a provider phrasing the rules
 * have never seen still gets a kind and an owner.
 */

import { choice } from '@typesafe-ai/sdk';
import type { ProviderFaultKind, ProviderId } from '@/lib/admin/provider-fault';
import { askJev } from '../client';

export const FAULT_QUESTIONS = {
  kind: choice('What kind of upstream failure does `error_text` describe?', {
    credit_exhausted: 'The account balance, credits, quota, or budget is spent; retrying cannot succeed until someone pays or tops up',
    plan_gated_model: 'The requested model or feature exists but this account/plan is not allowed to use it',
    missing_credential: 'No API key/token/credential is configured at all for the provider',
    invalid_credential: 'A credential is present but the provider rejected it (invalid, expired, revoked, disabled)',
    rate_limited: 'Temporary throttling or overload that will clear on its own (429, too many requests, overloaded)',
    none: 'Not a provider/account fault: a bug, schema/validation error, timeout, network blip, or anything else',
  }),
  provider: choice('Which upstream provider is `error_text` about?', {
    anthropic: 'Anthropic / Claude',
    openai: 'OpenAI / GPT',
    vercel_ai_gateway: 'Vercel AI Gateway',
    inngest: 'Inngest',
    unknown: 'Cannot tell, or some other service',
  }),
} as const;

export interface SemanticFault {
  kind: ProviderFaultKind | 'none';
  kindConfidence: number;
  provider: ProviderId;
  providerConfidence: number;
  model: string;
  latencyMs: number;
}

export async function classifyProviderFaultSemantic(errorText: string): Promise<SemanticFault | null> {
  const text = errorText.trim();
  if (!text) return null;
  const result = await askJev({ error_text: text.slice(0, 4_000) }, FAULT_QUESTIONS, {
    purpose: 'provider_fault',
  });
  if (!result) return null;
  return {
    kind: result.answers.kind.choice,
    kindConfidence: result.answers.kind.confidence,
    provider: result.answers.provider.choice,
    providerConfidence: result.answers.provider.confidence,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}
