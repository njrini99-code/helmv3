'use client';

import { processGolfTeamInvitation, redeemStaffInvite } from '@/app/golf/actions/teams';
import { signupWithStaffInviteAction } from '@/app/golf/actions/auth';
import { createClient } from '@/lib/supabase/client';
import { chEndSession } from '../../lib/sign-out';

/**
 * The calls the join screens make: today's actions, called the way today's pages call them, so the screens change
 * presentation and nothing the server decides (the code is resolved and the membership made server-side, a staff
 * invitation is verified by its signed token).
 */
export interface GateWrites {
  join: typeof processGolfTeamInvitation;
  redeemStaff: typeof redeemStaffInvite;
  signUpStaff: typeof signupWithStaffInviteAction;
  /** Whether someone is signed in on this browser (the staff invitation's one-button accept), by the browser's own session. */
  signedIn: () => Promise<{ email: string | null } | null>;
  /**
   * The wrong account is signed in: end this session and go to sign in, with this link kept to come back to. It is a full
   * page load, as every sign-out is, so nothing of the first person stays in the router's cache.
   */
  switchAccount: (returnTo: string) => Promise<void>;
}

export const gateWrites: GateWrites = {
  join: processGolfTeamInvitation,
  redeemStaff: redeemStaffInvite,
  signUpStaff: signupWithStaffInviteAction,
  async signedIn() {
    try {
      const { data } = await createClient().auth.getUser();
      return data.user ? { email: data.user.email ?? null } : null;
    } catch {
      return null;
    }
  },
  async switchAccount(returnTo) {
    await chEndSession('auth.gate');
    window.location.replace(`/golf/login?returnTo=${encodeURIComponent(returnTo)}`);
  },
};
