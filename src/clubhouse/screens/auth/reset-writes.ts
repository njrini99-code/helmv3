'use client';

import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { raceWithTimeout } from '@/lib/demo/gate-probe';
import { createClient } from '@/lib/supabase/client';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { clearPrivateServiceWorkerCaches } from '@/lib/offline/private-caches';
import { chReport } from '../../lib/track';
import { FAILURE_COPY } from '../../ui/Notices';
import { describeResetFailure, type ResetFailure } from './reset-state';

/**
 * Every call the new-password page makes. They are today's page's calls
 * (`src/app/golf/(auth)/reset-password/page.tsx`), in the same order, so the page changes presentation and nothing the
 * server decides:
 *
 *  - the LINK is the authorization, never an existing session: its `token_hash` is verified (`verifyOtp`, type
 *    recovery) even when someone is already signed in, which replaces that session with the account the link is for;
 *  - the password is changed with `updateUser`, then every OTHER session is signed out (`signOut({ scope: 'others' })`,
 *    owner 2026-10-18), and this device stays signed in;
 *  - a spent or expired link asks for a new one through `requestPasswordResetAction`, which answers the same whether or
 *    not the address has an account.
 */
export interface ResetWrites {
  /** `previous` is who was signed in on this device before the link replaced that session, when it was someone else. */
  verifyLink: (tokenHash: string) => Promise<{ ok: true; email: string; previous: string | null } | { ok: false }>;
  savePassword: (password: string) => Promise<{ ok: true } | { ok: false; failure: ResetFailure }>;
  /** Best effort: the password is already changed, so a failure here must not strand the person on the form. */
  revokeOthers: () => Promise<void>;
  requestReset: typeof requestPasswordResetAction;
}

type Browser = ReturnType<typeof createClient>;
let client: Browser | null = null;
// One browser client for the page, as today's page memoizes it, so the session the link made is the one that saves.
const supabase = (): Browser => (client ??= createClient());

export const resetWrites: ResetWrites = {
  async verifyLink(tokenHash) {
    try {
      const sb = supabase();
      // Who is here before the link replaces them. A shared laptop should say so rather than change accounts silently.
      // The stored session, read without a network call, so it can never hold the link's own check up.
      const before = await raceWithTimeout(sb.auth.getSession(), 1500)
        .then((r) => r.data.session?.user ?? null)
        // A slow or unreadable stored session only drops the "someone else was signed in" line; the link check goes on.
        .catch(() => null);
      // Someone already signed in on this device: their cached pages go before the link replaces the session, so the
      // next person here cannot see them offline. Nothing is revoked yet: a spent or crafted link must not sign anyone
      // out (the server session is only ended by Sign out, and a successful reset signs every other session out).
      if (before) {
        clearAllCachedResources();
        await clearPrivateServiceWorkerCaches();
      }
      // Every GolfHelm reset link carries a token_hash, minted on the server and sent through Resend; there is no PKCE
      // code to exchange. A link without one goes to verifyOtp with an empty hash, which Supabase refuses: a missing or
      // tampered parameter can only land on "expired".
      const { data, error } = await sb.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
      // Not reported: a spent or expired link is the expected answer here, and the page says so.
      if (error) return { ok: false };
      const email = data?.user?.email ?? data?.session?.user?.email ?? '';
      const was = before?.email ?? null;
      return { ok: true, email, previous: was && was.trim().toLowerCase() !== email.trim().toLowerCase() ? was : null };
    } catch (err) {
      chReport(err, { surface: 'auth.reset', action: 'verifyLink', severity: 'medium' });
      return { ok: false };
    }
  },
  async savePassword(password) {
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) return { ok: false, failure: describeResetFailure(error) };
      return { ok: true };
    } catch (err) {
      chReport(err, { surface: 'auth.reset', action: 'savePassword', severity: 'high' });
      return { ok: false, failure: { kind: 'banner', message: FAILURE_COPY.save } };
    }
  },
  async revokeOthers() {
    try {
      const r = await supabase().auth.signOut({ scope: 'others' });
      // Other sessions still expire on refresh; reported because they stay signed in until then.
      if (r?.error) chReport(r.error, { surface: 'auth.reset', action: 'revokeOthers', severity: 'medium' });
    } catch (err) {
      chReport(err, { surface: 'auth.reset', action: 'revokeOthers', severity: 'medium' });
    }
  },
  requestReset: requestPasswordResetAction,
};
