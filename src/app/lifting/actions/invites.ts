'use server';

// =============================================================================
// src/app/lifting/actions/invites.ts
//
// W2-A — Helm Lifting Lab: invite / revoke / resend / accept lifecycle.
//
// SECURITY MODEL
//   inviteLiftingCoach, revokeLiftingInvite, resendLiftingInvite
//     — Caller must be a head coach (is_primary OR is_head_coach) on a team
//       belonging to the target org in either baseball or golf.  We verify
//       this with a READ-ONLY cross-sport capability check BEFORE touching
//       helm_lifting_coach_invites.  withLiftingAction is NOT used here
//       because the inviting head coach has no helm_lifting_* identity yet
//       (the invite is the first step of onboarding).
//
//   acceptLiftingInvite
//     — Auth-gated, token/status/expiry/email all re-validated server-side.
//       The heavy lifting (UPSERT coach row, flip viewer can_edit, seed
//       assignments + athletes) is delegated to the SECURITY DEFINER RPC
//       `helm_lifting_accept_invite`.  The accepting user is never trusted to
//       supply their own team or role — it all comes from the stored invite.
//
// No destructive writes:
//   - Stage-and-swap upsert on refresh (existing pending invite updated in
//     place; token preserved so prior email links still resolve before expiry).
//   - Revoke = status flip to 'revoked', never a delete.
//   - Accept = delegated to DEFINER RPC (handles coach upsert + viewer
//     downgrade atomically).
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerException } from '@/lib/server-error-logger';
import { renderLiftingInviteEmail } from '@/lib/email/lifting-invite-template';
import type {
  HelmLiftingCoachInviteRow,
  HelmLiftingInviteStatus,
} from '@/lib/types/helm-lifting';

// ─── Shared result shape ─────────────────────────────────────────────────────

export interface LiftingInviteResult {
  success: boolean;
  error?: string;
  token?: string;
}

export interface AcceptLiftingInviteResult {
  success: boolean;
  error?: string;
  needsCoachProfile?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FEATURE = 'lifting-invites';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function inviteExpiresAt(): string {
  return new Date(Date.now() + INVITE_TTL_MS).toISOString();
}

/** Build the full accept URL from the token. */
function buildAcceptUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL?.startsWith('http')
      ? process.env.VERCEL_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://helmsportslabs.com';
  return `${base}/lifting/join/${token}`;
}

/**
 * Verify the current user is a head coach (is_primary OR is_head_coach) on
 * at least one team in the given organization. Checks both baseball and golf.
 *
 * Returns: { ok: true, inviterName, sourceTeamId, sport, orgName } on success.
 * Returns: { ok: false, error } when the check fails.
 *
 * This is a READ-ONLY guard — it never writes.
 */
async function verifyHeadCoachForOrg(
  userId: string,
  orgId: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      inviterName: string;
      sourceTeamId: string | null;
      sport: 'baseball' | 'golf';
      orgName: string;
    }
> {
  const supabase = await createClient();

  // Resolve org name first (we need it for the invite email regardless of sport).
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) {
    return { ok: false, error: 'Organization not found.' };
  }

  const orgName = (org.name as string | null) ?? 'your organization';

  // ── Baseball head coach check ──────────────────────────────────────────────
  const { data: bCoach } = await supabase
    .from('baseball_coaches')
    .select('id, full_name, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (bCoach && bCoach.organization_id === orgId) {
    // Check for a head-coach or primary staff row on any team in this org.
    const { data: staffRows } = await supabase
      .from('baseball_team_coach_staff')
      .select('id, team_id, is_primary, is_head_coach')
      .eq('coach_id', bCoach.id)
      .eq('status', 'active')
      .limit(20);

    // Cross-check: the team must belong to orgId.
    if (staffRows && staffRows.length > 0) {
      const teamIds = staffRows.map((r) => String(r.team_id)).filter(Boolean);
      const { data: teams } = await supabase
        .from('baseball_teams')
        .select('id')
        .eq('organization_id', orgId)
        .in('id', teamIds);

      const orgTeamIds = new Set((teams ?? []).map((t) => String(t.id)));
      const headRow = staffRows.find(
        (r) =>
          orgTeamIds.has(String(r.team_id)) &&
          (r.is_primary === true || r.is_head_coach === true),
      );

      if (headRow) {
        return {
          ok: true,
          inviterName: (bCoach.full_name as string | null) ?? 'Your Head Coach',
          sourceTeamId: String(headRow.team_id),
          sport: 'baseball',
          orgName,
        };
      }
    }
  }

  // ── Golf head coach check ──────────────────────────────────────────────────
  const { data: gCoach } = await supabase
    .from('golf_coaches')
    .select('id, full_name, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (gCoach && gCoach.organization_id === orgId) {
    // Golf uses golf_team_coach_staff — only is_primary is the head-coach flag
    // (golf_team_coach_staff has no is_head_coach column in the typed schema).
    const { data: gStaff } = await supabase
      .from('golf_team_coach_staff')
      .select('id, team_id, is_primary')
      .eq('coach_id', gCoach.id)
      .limit(20);

    if (gStaff && gStaff.length > 0) {
      const gTeamIds = gStaff.map((r) => String(r.team_id)).filter(Boolean);
      const { data: gTeams } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', orgId)
        .in('id', gTeamIds);

      const gOrgTeamIds = new Set((gTeams ?? []).map((t) => String(t.id)));
      const gHeadRow = gStaff.find(
        (r) => gOrgTeamIds.has(String(r.team_id)) && r.is_primary === true,
      );

      if (gHeadRow) {
        return {
          ok: true,
          inviterName: (gCoach.full_name as string | null) ?? 'Your Head Coach',
          sourceTeamId: String(gHeadRow.team_id),
          sport: 'golf',
          orgName,
        };
      }
    }
  }

  return {
    ok: false,
    error: 'Only a head coach of this organization can send Lifting Lab invitations.',
  };
}

/**
 * Send the invite email via Resend. No-op (with logged warning) if
 * RESEND_API_KEY is absent — keeps the action safe in dev/preview.
 */
async function sendInviteEmail(params: {
  toEmail: string;
  inviterName: string;
  orgName: string;
  roleTitle: string | null;
  token: string;
  expiresAt: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev / preview without key: skip silently (logged as info).
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);

    const acceptUrl = buildAcceptUrl(params.token);
    const { subject, html, text } = renderLiftingInviteEmail({
      inviterName: params.inviterName,
      orgName: params.orgName,
      roleTitle: params.roleTitle,
      acceptUrl,
      expiresAt: params.expiresAt,
    });

    await resend.emails.send({
      from: 'Helm Sports Labs <noreply@helmsportslabs.com>',
      to: params.toEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    // Email failure must never block the invite being written to the DB.
    await logServerException(
      err instanceof Error ? err : new Error(String(err)),
      {
        action: 'sendLiftingInviteEmail',
        featureArea: FEATURE,
        source: 'server_action',
        handled: true,
        skipSentry: false,
        tags: { sport: 'lifting', feature: FEATURE },
      },
      'warning',
    );
  }
}

// =============================================================================
// inviteLiftingCoach
// =============================================================================

export interface InviteLiftingCoachArgs {
  /** Target email (will be lowercased). */
  email: string;
  /** Org-scoped; the head coach verifies membership before writing. */
  orgId: string;
  /** Optional display title for the invite (e.g. "Head Strength & Conditioning Coach"). */
  roleTitle?: string | null;
}

/**
 * Create (or stage-and-swap refresh) a Lifting Lab coach invitation.
 *
 * Auth: caller must be an authenticated head coach for `orgId`.
 * Non-destructive: if a pending invite already exists for the email+org,
 * it is refreshed in place (token preserved, expiry reset, role_title updated).
 */
export async function inviteLiftingCoach(
  args: InviteLiftingCoachArgs,
): Promise<LiftingInviteResult> {
  const email = (args.email ?? '').trim().toLowerCase();
  const orgId = (args.orgId ?? '').trim();
  const roleTitle =
    typeof args.roleTitle === 'string' && args.roleTitle.trim()
      ? args.roleTitle.trim()
      : null;

  if (!email || !isValidEmail(email)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  if (!orgId) {
    return { success: false, error: 'Organization is required.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in.' };
  }

  // ── Authority check ──────────────────────────────────────────────────────
  const authCheck = await verifyHeadCoachForOrg(user.id, orgId);
  if (!authCheck.ok) {
    return { success: false, error: authCheck.error };
  }

  // ── Guard: no active lifting coach already on this org ────────────────────
  const { data: activeCoach } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle() as { data: { id: string } | null };

  if (activeCoach) {
    return {
      success: false,
      error: 'This organization already has an active Lifting Lab coach.',
    };
  }

  const expiresAt = inviteExpiresAt();

  // ── Stage-and-swap: refresh pending invite if one exists ──────────────────
  const { data: prior } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .select('id, token')
    .eq('organization_id', orgId)
    .ilike('email', email)
    .eq('status', 'pending')
    .maybeSingle() as { data: { id: string; token: string } | null };

  if (prior) {
    const { error: updErr } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
      .update({
        role_title: roleTitle,
        invited_by_user_id: user.id,
        invited_by_sport: authCheck.sport,
        source_team_id: authCheck.sourceTeamId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prior.id);

    if (updErr) {
      return { success: false, error: 'Could not refresh the invitation.' };
    }

    // Re-send email with the existing token.
    await sendInviteEmail({
      toEmail: email,
      inviterName: authCheck.inviterName,
      orgName: authCheck.orgName,
      roleTitle,
      token: prior.token,
      expiresAt,
    });

    revalidatePath('/lifting/dashboard/settings');
    return { success: true, token: prior.token };
  }

  // ── Fresh insert — DB mints the token ────────────────────────────────────
  const { data: inserted, error: insErr } = await fromUntyped(
    supabase,
    'helm_lifting_coach_invites',
  )
    .insert({
      organization_id: orgId,
      email,
      invited_by_user_id: user.id,
      invited_by_sport: authCheck.sport,
      source_team_id: authCheck.sourceTeamId,
      role_title: roleTitle,
      expires_at: expiresAt,
    })
    .select('id, token')
    .single() as { data: { id: string; token: string } | null; error: unknown };

  if (insErr || !inserted) {
    return { success: false, error: 'Could not send the invitation.' };
  }

  await sendInviteEmail({
    toEmail: email,
    inviterName: authCheck.inviterName,
    orgName: authCheck.orgName,
    roleTitle,
    token: inserted.token,
    expiresAt,
  });

  revalidatePath('/lifting/dashboard/settings');
  return { success: true, token: inserted.token };
}

// =============================================================================
// revokeLiftingInvite
// =============================================================================

/**
 * Revoke a pending Lifting Lab invite (status flip to 'revoked', never delete).
 * Caller must be a head coach of the org the invite belongs to.
 */
export async function revokeLiftingInvite(
  inviteId: string,
): Promise<LiftingInviteResult> {
  if (!inviteId) return { success: false, error: 'Invite ID is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be signed in.' };

  // Load the invite first (to get org_id for the authority check).
  const { data: invite } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .select('id, organization_id, status')
    .eq('id', inviteId)
    .maybeSingle() as {
    data: { id: string; organization_id: string; status: HelmLiftingInviteStatus } | null;
  };

  if (!invite) return { success: false, error: 'Invitation not found.' };
  if (invite.status !== 'pending') {
    return { success: false, error: 'Only pending invitations can be revoked.' };
  }

  const authCheck = await verifyHeadCoachForOrg(user.id, invite.organization_id);
  if (!authCheck.ok) return { success: false, error: authCheck.error };

  const { error: updErr } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .update({
      status: 'revoked' as HelmLiftingInviteStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inviteId);

  if (updErr) return { success: false, error: 'Could not revoke the invitation.' };

  revalidatePath('/lifting/dashboard/settings');
  return { success: true };
}

// =============================================================================
// resendLiftingInvite
// =============================================================================

/**
 * Re-send an existing pending invite (refreshes expiry, re-sends email).
 * Equivalent to calling inviteLiftingCoach with the same email — uses
 * stage-and-swap to preserve the existing invite row.
 */
export async function resendLiftingInvite(
  inviteId: string,
): Promise<LiftingInviteResult> {
  if (!inviteId) return { success: false, error: 'Invite ID is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be signed in.' };

  const { data: invite } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .select('id, organization_id, email, role_title, token, status')
    .eq('id', inviteId)
    .maybeSingle() as {
    data: Pick<
      HelmLiftingCoachInviteRow,
      'id' | 'organization_id' | 'email' | 'role_title' | 'token' | 'status'
    > | null;
  };

  if (!invite) return { success: false, error: 'Invitation not found.' };
  if (invite.status !== 'pending') {
    return {
      success: false,
      error: 'Only pending invitations can be re-sent. Revoke and re-invite if needed.',
    };
  }

  const authCheck = await verifyHeadCoachForOrg(user.id, invite.organization_id);
  if (!authCheck.ok) return { success: false, error: authCheck.error };

  const expiresAt = inviteExpiresAt();

  const { error: updErr } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .update({
      invited_by_user_id: user.id,
      invited_by_sport: authCheck.sport,
      source_team_id: authCheck.sourceTeamId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (updErr) return { success: false, error: 'Could not refresh the invitation.' };

  await sendInviteEmail({
    toEmail: invite.email,
    inviterName: authCheck.inviterName,
    orgName: authCheck.orgName,
    roleTitle: invite.role_title,
    token: invite.token,
    expiresAt,
  });

  revalidatePath('/lifting/dashboard/settings');
  return { success: true, token: invite.token };
}

// =============================================================================
// acceptLiftingInvite
// =============================================================================

/**
 * Accept a Lifting Lab coaching invitation by token.
 *
 * All validation is performed server-side (token, status, expiry, email match).
 * The SECURITY DEFINER RPC `helm_lifting_accept_invite` performs the atomic
 * UPSERT of the coach row + invite status flip + viewer can_edit downgrade.
 *
 * The accepting user does NOT need an existing lifting coach profile — this
 * action creates it via the RPC.
 */
export async function acceptLiftingInvite(
  token: string,
): Promise<AcceptLiftingInviteResult> {
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Invalid invitation link.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in.' };
  }

  // Re-validate invite before calling the RPC (gives the UI a friendlier error).
  const { data: invite } = await fromUntyped(supabase, 'helm_lifting_coach_invites')
    .select('id, organization_id, email, status, expires_at')
    .eq('token', token)
    .maybeSingle() as {
    data: Pick<
      HelmLiftingCoachInviteRow,
      'id' | 'organization_id' | 'email' | 'status' | 'expires_at'
    > | null;
  };

  if (!invite) {
    return { success: false, error: 'This invitation is invalid or has expired.' };
  }
  if (invite.status !== 'pending') {
    return {
      success: false,
      error:
        invite.status === 'accepted'
          ? 'This invitation has already been accepted.'
          : 'This invitation is no longer active.',
    };
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { success: false, error: 'This invitation has expired. Ask your head coach to resend it.' };
  }

  // Email match check — must match the signed-in account's email.
  const userEmail = (user.email ?? '').trim().toLowerCase();
  if (!userEmail || userEmail !== String(invite.email).trim().toLowerCase()) {
    return {
      success: false,
      error:
        'This invitation was sent to a different email address. Sign in with the invited account.',
    };
  }

  // Delegate to the SECURITY DEFINER RPC — it re-validates everything and
  // performs the UPSERT + status flip + viewer downgrade atomically.
  const { data: rpcData, error: rpcErr } = (await supabase.rpc(
    'helm_lifting_accept_invite' as never,
    { p_token: token } as never,
  )) as { data: unknown; error: unknown };

  if (rpcErr) {
    await logServerException(
      rpcErr instanceof Error ? rpcErr : new Error(String(rpcErr)),
      {
        action: 'acceptLiftingInvite',
        featureArea: FEATURE,
        source: 'server_action',
        handled: true,
        tags: { sport: 'lifting', feature: FEATURE },
      },
      'error',
    );
    return { success: false, error: 'Could not accept the invitation. Please try again.' };
  }

  const result = (rpcData ?? {}) as {
    ok?: boolean;
    reason?: string;
    coach_id?: string;
  };

  if (!result.ok) {
    const reasonMessages: Record<string, string> = {
      invalid: 'This invitation is invalid or has expired.',
      not_pending: 'This invitation is no longer active.',
      expired: 'This invitation has expired. Ask your head coach to resend it.',
      wrong_email:
        'This invitation was sent to a different email address. Sign in with the invited account.',
      unauthorized: 'You must be signed in.',
    };
    return {
      success: false,
      error:
        reasonMessages[result.reason ?? ''] ??
        'Could not accept this invitation. Please try again.',
    };
  }

  revalidatePath('/lifting/dashboard');
  return { success: true };
}
