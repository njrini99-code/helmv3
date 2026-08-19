import type { Metadata } from 'next';
import { previewStaffInvite } from '@/app/golf/actions/teams';
import { StaffJoinClient } from './staff-join-client';

/**
 * GolfHelm — accept a coach-issued staff invitation.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * `createStaffInvite` / `redeemStaffInvite` (src/app/golf/actions/teams.ts)
 * were fully built and secure but had NO caller anywhere in the app — a
 * finished capability with no door. The consequence reached a customer on
 * 2026-08-18: a head coach handed his assistant the team code, the assistant
 * hit /golf/signup (a PLAYER gate), found "Player | Coach" and no way to say
 * "assistant coach", and picking Coach would have minted a duplicate phantom
 * program instead of joining the one he was invited to.
 *
 * The invite token — not the team join code — is what authorizes staff. The
 * join code is deliberately given to every player on the roster, so it can
 * never grant staff access; see the header of src/lib/golf/staff-invite.ts.
 *
 * Signed out is the EXPECTED state here: an invited assistant usually has no
 * account yet, and self-serve signup cannot create one for them (it requires a
 * player team code). So this page carries account creation itself, gated by
 * the invite.
 */

export const metadata: Metadata = {
  title: 'Staff invitation · GolfHelm',
  robots: { index: false, follow: false },
};

export default async function StaffJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await previewStaffInvite(token);

  return <StaffJoinClient token={token} preview={preview} />;
}
