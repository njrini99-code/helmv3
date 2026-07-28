/**
 * The five-day Helm Bridge window this pins down.
 *
 * One exhausted model account produced the single largest block of incidents in
 * the feed, spread across five differently-worded rows and three severities:
 *
 *   n=19  warning  chat/stream: model error — Your credit balance is too low…
 *   n=3   warning  compose() LLM call failed for task=round_review: Free tier…
 *   n=1   error    Free tier users do not have access to this model. Upgrade…
 *   n=1   error    Couldn't read this image right now. Please try again in a moment…
 *   n=1   warning  Failed to send coachhelm/round.submitted to Inngest: 404 Event key not found
 *
 * Nothing was topped up for 33 hours. These assertions cover the three
 * properties that failure depended on: the class is recognised at all, the
 * message it produces is stable enough to group, and an operator-blocking fault
 * is not filed at the same tier as a self-healing rate limit.
 */

import { describe, it, expect } from 'vitest';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';

/** Verbatim provider text, as it reached admin_events. */
const REAL_MESSAGES = {
  anthropicCredit:
    'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
  gatewayFreeTier:
    'Free tier users do not have access to this model. Upgrade to paid credits at https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys',
  inngestKey: 'Inngest API Error: 404 Event key not found',
};

describe('classifyProviderFault', () => {
  it('recognises an exhausted Anthropic balance as an operator-blocking fault', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.anthropicCredit));
    expect(fault).not.toBeNull();
    expect(fault!.kind).toBe('credit_exhausted');
    expect(fault!.provider).toBe('anthropic');
    expect(fault!.code).toBe('provider_anthropic_credit_exhausted');
    expect(fault!.needsOperator).toBe(true);
  });

  /**
   * The gateway's out-of-credit response is worded as a plan gate ("Free tier
   * users do not have access to this model"), and it says that whichever model
   * you ask for. Order in FAULT_RULES is what keeps it out of the
   * plan_gated_model bucket, so pin the order, not just the match.
   */
  it('reads the gateway\'s "free tier" wording as a spend state, not a model gate', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.gatewayFreeTier));
    expect(fault!.kind).toBe('credit_exhausted');
    expect(fault!.provider).toBe('vercel_ai_gateway');
  });

  /**
   * `isInngestConfigured()` returns true for a rotated key, so telling an
   * operator the credential is MISSING would send them hunting for an env var
   * that is present. It has to classify as invalid.
   */
  it('classifies a rotated Inngest event key as invalid, not missing', () => {
    const fault = classifyProviderFault(new Error(REAL_MESSAGES.inngestKey));
    expect(fault!.kind).toBe('invalid_credential');
    expect(fault!.provider).toBe('inngest');
    expect(fault!.code).toBe('provider_inngest_invalid_credential');
    expect(fault!.summary).toContain('Durable background jobs');
    expect(fault!.summary).toContain('set, but no longer valid');
  });

  it('treats a rate limit as transient — no operator, lower tier', () => {
    const fault = classifyProviderFault(new Error('429 Too Many Requests'));
    expect(fault!.kind).toBe('rate_limited');
    expect(fault!.needsOperator).toBe(false);
    expect(providerFaultSeverity(fault!).severity).toBe('warning');
  });

  it('tiers an operator-blocking fault as an outage, and never sends it to Sentry', () => {
    for (const text of Object.values(REAL_MESSAGES)) {
      const fault = classifyProviderFault(new Error(text))!;
      const { severity, skipSentry } = providerFaultSeverity(fault);
      expect(severity).toBe('error');
      // No code change resolves a billing state — Sentry is the wrong destination.
      expect(skipSentry).toBe(true);
    }
  });

  /**
   * The summary is written into `admin_events.message`, which is what the
   * incident signature hashes. A billing URL or model slug in there mints a new
   * incident group per occurrence — the exact failure being fixed.
   */
  it('produces a message with no ids, URLs or counts in it', () => {
    for (const text of Object.values(REAL_MESSAGES)) {
      const { summary } = classifyProviderFault(new Error(text))!;
      expect(summary).not.toMatch(/https?:\/\//);
      expect(summary).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(summary).not.toMatch(/\d{3,}/);
    }
  });

  it('reads the informative text out of a nested cause and a raw provider object', () => {
    const wrapped = new Error('Bad Request');
    (wrapped as { cause?: unknown }).cause = new Error(REAL_MESSAGES.anthropicCredit);
    expect(classifyProviderFault(wrapped)!.kind).toBe('credit_exhausted');

    // The AI SDK's onError hands over whatever the transport produced, which is
    // often the provider's parsed JSON body rather than an Error.
    expect(
      classifyProviderFault({ type: 'invalid_request_error', message: REAL_MESSAGES.anthropicCredit })!.kind,
    ).toBe('credit_exhausted');
  });

  it('leaves everything that is not a provider/account fault alone', () => {
    for (const notAFault of [
      new Error('new row violates row-level security policy for table "golf_conversations"'),
      new Error('canceling statement due to statement timeout'),
      new Error("Cannot read properties of undefined (reading 'id')"),
      'No active team membership for player',
      null,
      undefined,
      {},
      '',
    ]) {
      expect(classifyProviderFault(notAFault)).toBeNull();
    }
  });
});
