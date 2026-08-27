/**
 * One continuous Inngest outage, five Bridge incidents.
 *
 * Production, measured 2026-08-27: 450 of the 751 error-or-critical events in
 * 30 days were ONE fault — the signing key in Vercel Production not matching
 * the Inngest app — split across five fingerprints, because the message
 * embedded the measured signature age:
 *
 *   n=246  …failed signature validation (signature was 1s old, well inside…
 *   n=181  …failed signature validation (signature was 0s old, well inside…
 *   n=13   …failed signature validation (signature was 3s old, well inside…
 *   n=8    …failed signature validation (signature was 2s old, well inside…
 *   n=2    …failed signature validation (signature was 4s old, well inside…
 *
 * `normalizeIncidentMessagePrefix` collapses UUIDs, 16+ hex and integers of
 * 5+ digits. A ONE-DIGIT number is none of those, and it sat at roughly
 * character 70 — inside the hashed 80-character prefix.
 *
 * Four guards below, because the fix has independent halves and any one of
 * them regressing silently re-splits the group.
 */

import { describe, it, expect } from 'vitest';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';

const STABLE =
  '[inngest] A SIGNED request failed signature validation' +
  ' — the INNGEST_SIGNING_KEY in Vercel Production does not match the Inngest app that is calling us. ';

function sig(message: string, errorCode: string | null = null, route: string | null = null): string {
  return buildIncidentSignature({ severity: 'error', errorCode, route, message });
}

describe('incident grouping — Inngest signature skew', () => {
  it('the OLD message shape really did split on a single digit (the bug, pinned)', () => {
    // Guards the premise. If this stops being true the normaliser changed, and
    // the reasoning recorded in route.ts should be re-read rather than trusted.
    const old = (n: number) =>
      sig(
        '[inngest] A SIGNED request failed signature validation' +
          ` (signature was ${n}s old, well inside the 5-minute window, ` +
          'so this is a key mismatch and not clock skew) — the INNGEST_SIGNING_KEY…',
      );
    expect(new Set([old(0), old(1), old(2), old(3), old(4)]).size).toBe(5);
  });

  it('the stabilised message is one fingerprint regardless of the age measured', () => {
    // The age now travels on errorHint/extra, neither of which is hashed.
    expect(new Set([sig(STABLE), sig(STABLE), sig(STABLE)]).size).toBe(1);
  });

  it('the provider code collapses the route and the send path into ONE incident', () => {
    // buildIncidentSignature gives `provider_`-prefixed codes their own branch,
    // hashing `provider::<code>` alone — so the /api/inngest signature failure
    // and the client-side send failure ("Inngest API Error: 404 Event key not
    // found"), which already carried this code, stop being two groups.
    const code = 'provider_inngest_invalid_credential';
    const fromRoute = sig(STABLE, code, '/api/inngest');
    const fromSendPath = sig('Failed to send coachhelm/round.submitted to Inngest', code, '/golf/rounds');
    expect(fromRoute).toBe(fromSendPath);
  });

  it('an expired signature is NOT folded in with a credential rejection', () => {
    // Different root cause: clock/latency on our side, not the provider
    // rejecting a credential. It carries no provider code precisely so it
    // cannot inherit "reissue the signing key" as its remediation.
    const expired = sig(
      "[inngest] A SIGNED request was rejected because its signature was past the SDK's 5-minute tolerance.",
    );
    expect(expired).not.toBe(sig(STABLE, 'provider_inngest_invalid_credential'));
  });
});
