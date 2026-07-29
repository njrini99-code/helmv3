// =============================================================================
// The login page must always reach a state where it can render its form.
//
// `checkingAuth` is the single thing standing between a visitor and the sign-in
// form, and one effect clears it. That effect used to `await
// supabase.auth.getUser()` bare — no catch, no timeout — so any outcome other
// than a clean resolve left the page pinned on "Checking sign-in status" with
// nothing to type into.
//
// This suite pins the CONTRACT that fixes it, at the seam the page now depends
// on (probeSignedIn), against the three failure modes that actually occur in
// production:
//
//   1. getUser() rejects            — network down, CORS, 5xx
//   2. getUser() never settles      — the #918 hang: a stale/expired httpOnly
//                                     auth cookie leaves GoTrue's internal
//                                     refresh-token exchange pending forever,
//                                     and the browser fetch it issues has no
//                                     timeout of its own
//   3. getUser() resolves with an   — the error surfaces in the payload, not
//      `error` in the payload         as a throw
//
// All three must resolve to "signed out", because a login page that shows its
// form to someone already authenticated costs one extra sign-in, while a login
// page that shows nothing costs the account.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { probeSignedIn, DEMO_AUTH_PROBE_TIMEOUT_MS } from '@/lib/demo/gate-probe';

/** A client whose getUser() behaves however the test needs. */
function clientWith(getUser: () => Promise<{ data: { user: unknown }; error: unknown }>) {
  return { auth: { getUser } } as Parameters<typeof probeSignedIn>[0];
}

describe('login auth probe — the page can always reach its form', () => {
  it('resolves to signed-out when getUser() rejects', async () => {
    const client = clientWith(() => Promise.reject(new Error('NetworkError')));
    await expect(probeSignedIn(client)).resolves.toBeNull();
  });

  it('resolves to signed-out when getUser() surfaces an error in the payload', async () => {
    const client = clientWith(async () => ({
      data: { user: { id: 'u1' } },
      error: { message: 'refresh_token_not_found' },
    }));
    // Note it returns null even though `user` is populated — a session that
    // errored is not a session to trust.
    await expect(probeSignedIn(client)).resolves.toBeNull();
  });

  it('resolves to signed-out when getUser() NEVER settles (the #918 hang)', async () => {
    vi.useFakeTimers();
    try {
      // A promise that is never resolved or rejected — exactly what a hung
      // refresh-token exchange looks like to the caller.
      const client = clientWith(() => new Promise(() => {}));
      const pending = probeSignedIn(client);

      await vi.advanceTimersByTimeAsync(DEMO_AUTH_PROBE_TIMEOUT_MS + 50);

      // Without the deadline this await would hang the test — which is exactly
      // what it did to the page.
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the user when getUser() succeeds (the probe is not just "always null")', async () => {
    // The non-vacuity assertion. A probe hardcoded to return null would satisfy
    // all three cases above while breaking the "you're already signed in"
    // branch of the page.
    const client = clientWith(async () => ({ data: { user: { id: 'u1' } }, error: null }));
    await expect(probeSignedIn(client)).resolves.toEqual({ id: 'u1' });
  });

  it('the login PAGE actually uses the probe, not a bare getUser()', () => {
    // Everything above tests the helper. On its own that is the same trap I hit
    // earlier tonight: a suite that is green while the thing it claims to
    // protect has quietly reverted. Nothing above would notice if the page went
    // back to `await supabase.auth.getUser()` — so assert the call site.
    const page = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');

    expect(page).toContain('probeSignedIn');

    // The auth-state-change subscription below it is a different concern and
    // legitimately touches `supabase.auth`; what must never come back is the
    // unguarded read whose only failure mode is an unreachable form.
    expect(
      page,
      'login/page.tsx calls supabase.auth.getUser() directly again. That call ' +
        'can hang forever (#918) and nothing else clears `checkingAuth`, so the ' +
        'sign-in form never renders. Use probeSignedIn from @/lib/demo/gate-probe.',
    ).not.toMatch(/await\s+supabase\.auth\.getUser\(\)/);
  });

  it('does not wait longer than the deadline before giving up', async () => {
    vi.useFakeTimers();
    try {
      const client = clientWith(() => new Promise(() => {}));
      let settled = false;
      void probeSignedIn(client).then(() => {
        settled = true;
      });

      // Just short of the deadline: still waiting, correctly.
      await vi.advanceTimersByTimeAsync(DEMO_AUTH_PROBE_TIMEOUT_MS - 100);
      expect(settled).toBe(false);

      // Past it: given up.
      await vi.advanceTimersByTimeAsync(200);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
