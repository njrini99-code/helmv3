import type { PreviewStaffInviteResult } from '@/app/golf/actions/teams';
import type { JoinTeamData } from '../screens/auth/JoinTeam';
import type { GateWrites } from '../screens/auth/gate-writes';
import type { ResetWrites } from '../screens/auth/reset-writes';
import { describeResetFailure } from '../screens/auth/reset-state';

/** The beside-sign-in screens' sample people and fake calls (/clubhouse-preview/auth). Nothing here reaches a server. */

export const PREVIEW_RESET_EMAIL = 'maya.reyes@university.edu';

const after = <T,>(ms: number, v: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(v), ms));

/**
 * The new-password page's calls, faked. The link checks out after a beat; Save answers after a beat; `sim` says which
 * call fails: `expired` (the link is spent), `weak` (the server refuses the password), `same` (it is the old one),
 * `rate` and `network` (a failure that is not about the password), `saveexpired` (the session ran out between the check
 * and Save), `hold` (Save never answers).
 */
export function previewResetWrites(sim?: string): ResetWrites {
  return {
    verifyLink: () => (sim === 'expired' ? after(700, { ok: false as const }) : after(700, { ok: true as const, email: PREVIEW_RESET_EMAIL, previous: null })),
    savePassword: () => {
      if (sim === 'hold') return new Promise<never>(() => {});
      if (sim === 'weak') return after(500, { ok: false as const, failure: describeResetFailure({ code: 'weak_password' }) });
      if (sim === 'same') return after(500, { ok: false as const, failure: describeResetFailure({ code: 'same_password' }) });
      if (sim === 'rate') return after(500, { ok: false as const, failure: describeResetFailure({ status: 429 }) });
      if (sim === 'network') return after(500, { ok: false as const, failure: describeResetFailure({ name: 'AuthRetryableFetchError' }) });
      if (sim === 'saveexpired') return after(500, { ok: false as const, failure: describeResetFailure({ code: 'session_not_found' }) });
      return after(600, { ok: true as const });
    },
    revokeOthers: () => after(100, undefined),
    requestReset: () => after(700, { success: true, message: 'If an account exists with this email, a password reset link will be sent.' }),
  };
}

// ── Join a team ──────────────────────────────────────────────────────────────


export const PREVIEW_JOIN: JoinTeamData = {
  code: 'K7PQX4MN',
  team: { id: 'team-1', name: 'Varsity Golf', season: '2026–27', organization: { name: 'Pine Needles University', city: 'Southern Pines', state: 'NC', logoUrl: null } },
  player: { name: 'Theo Marchetti', year: '2027', email: 'theo.marchetti@university.edu' },
};
/** A program with a long name and no place, to see the plate hold. */
export const PREVIEW_JOIN_LONG: JoinTeamData = {
  ...PREVIEW_JOIN,
  team: { id: 'team-2', name: 'Women’s Golf', season: null, organization: { name: 'The University of North Carolina at Greensboro Spartans' } },
  player: { name: 'Alexandria Montgomery-Okonkwo', year: 'sophomore', email: 'alexandria.montgomery-okonkwo@students.uncg.edu' },
};

/** The join call, faked: `sim` is what it answers (`already`, `another`, `refused`, `network`, `hold`). */
export function previewGateWrites(sim?: string): GateWrites {
  const after = <T,>(ms: number, v: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(v), ms));
  return {
    join: () => {
      if (sim === 'hold') return new Promise<never>(() => {});
      if (sim === 'already') return after(500, { success: true, alreadyMember: true });
      if (sim === 'another') return after(500, { success: false, error: 'You are already on Duke Women’s Golf. Golf players can only be on one team at a time.' });
      if (sim === 'refused') return after(500, { success: false, error: 'Failed to join team. Please try again.' });
      if (sim === 'network') return Promise.reject(new Error('network'));
      return after(600, { success: true });
    },
    redeemStaff: () => after(600, { success: true, teams: [{ id: 'team-1', name: 'Varsity Golf', gender: null }], multiTeam: false }),
    signUpStaff: () => after(600, { success: true }),
    signedIn: () => after(300, sim === 'signedout' ? null : { email: 'jordan.ellis@university.edu' }),
    switchAccount: async () => undefined,
  };
}

// ── Staff invitation ─────────────────────────────────────────────────────────

export const PREVIEW_STAFF: PreviewStaffInviteResult = { valid: true, role: 'coach', teamName: 'Varsity Golf', organizationName: 'Pine Needles University' };
export const PREVIEW_STAFF_ADMIN: PreviewStaffInviteResult = { valid: true, role: 'admin', teamName: undefined, organizationName: 'The University of North Carolina at Greensboro' };
export const PREVIEW_STAFF_EXPIRED: PreviewStaffInviteResult = { valid: false, error: 'That invitation has expired. Ask your head coach for a new one.' };
export const PREVIEW_STAFF_BAD: PreviewStaffInviteResult = { valid: false, error: 'That invitation link is not valid.' };
