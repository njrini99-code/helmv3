'use client';

import { requestPasswordResetAction } from '@/app/golf/actions/auth';
import { raceWithTimeout } from '@/lib/demo/gate-probe';
import { createClient } from '@/lib/supabase/client';
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
        .catch(() => null);
      // Every GolfHelm reset link carries a token_hash, minted on the server and sent through Resend; there is no PKCE
      // code to exchange. A link without one goes to verifyOtp with an empty hash, which Supabase refuses: a missing or
      // tampered parameter can only land on "expired".
      const { data, error } = await sb.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
      if (error) return { ok: false };
      const email = data?.user?.email ?? data?.session?.user?.email ?? '';
      const was = before?.email ?? null;
      return { ok: true, email, previous: was && was.trim().toLowerCase() !== email.trim().toLowerCase() ? was : null };
    } catch {
      return { ok: false };
    }
  },
  async savePassword(password) {
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) return { ok: false, failure: describeResetFailure(error) };
      return { ok: true };
    } catch {
      return { ok: false, failure: { kind: 'banner', message: 'Couldn’t save. Check your connection and try again.' } };
    }
  },
  async revokeOthers() {
    try {
      await supabase().auth.signOut({ scope: 'others' });
    } catch {
      // Other sessions still expire on refresh.
    }
  },
  requestReset: requestPasswordResetAction,
};
