/**
 * A dead credential must never be auto-resolved by silence.
 *
 * The Bridge captures provider faults well — one stable fingerprint per
 * (provider, kind), a plain-English summary, and a `needsOperator` flag that
 * already says no code change will fix it. Then the nightly auto-resolver closed
 * every one of them, because both of its rules infer "fixed" from a fingerprint
 * going quiet:
 *
 *   Rule A — nothing since the last production deploy ⇒ the deploy fixed it
 *   Rule B — nothing for 14 days ⇒ it went away
 *
 * True for a code defect. False for a provider fault, which only fires when
 * something happens to exercise the path — so a quiet weekend looks exactly like
 * a fix, and no deploy tops up a billing account.
 *
 * Measured in production 2026-08-06, every provider fault was flagged resolved
 * while still broken: provider_inngest_invalid_credential closed for 10 days
 * with a dead credential, and both AI accounts resolved while still out of
 * credit — one having last fired an hour earlier.
 */
import { describe, it, expect } from 'vitest';
import { isOperatorGatedFaultCode } from '@/lib/admin/provider-fault';

describe('isOperatorGatedFaultCode', () => {
  it('gates the faults only a human can clear', () => {
    // Every one of these was observed auto-resolved-while-broken in production.
    expect(isOperatorGatedFaultCode('provider_inngest_invalid_credential')).toBe(true);
    expect(isOperatorGatedFaultCode('provider_anthropic_credit_exhausted')).toBe(true);
    expect(isOperatorGatedFaultCode('provider_vercel_ai_gateway_credit_exhausted')).toBe(true);
    expect(isOperatorGatedFaultCode('provider_stripe_missing_credential')).toBe(true);
    expect(isOperatorGatedFaultCode('provider_anthropic_plan_gated_model')).toBe(true);
  });

  it('does NOT gate faults that genuinely clear on their own', () => {
    // A rate limit resolves itself; keeping it open forever would be its own
    // kind of noise, which is what this whole area is trying to remove.
    expect(isOperatorGatedFaultCode('provider_sentry_rate_limited')).toBe(false);
    expect(isOperatorGatedFaultCode('provider_vercel_unavailable')).toBe(false);
    expect(isOperatorGatedFaultCode('provider_sentry_unavailable')).toBe(false);
  });

  it('handles multi-word provider ids — the kind is a SUFFIX, not a split', () => {
    // `vercel_ai_gateway` contains underscores, so splitting on '_' to find the
    // kind would read the kind as "gateway" and gate nothing.
    expect(isOperatorGatedFaultCode('provider_vercel_ai_gateway_credit_exhausted')).toBe(true);
    expect(isOperatorGatedFaultCode('provider_vercel_ai_gateway_rate_limited')).toBe(false);
  });

  it('ignores anything that is not a provider fault', () => {
    expect(isOperatorGatedFaultCode(null)).toBe(false);
    expect(isOperatorGatedFaultCode(undefined)).toBe(false);
    expect(isOperatorGatedFaultCode('')).toBe(false);
    expect(isOperatorGatedFaultCode('23505')).toBe(false);
    // A normal app error that merely mentions a credential must not be gated.
    expect(isOperatorGatedFaultCode('auth_invalid_credential')).toBe(false);
  });
});
