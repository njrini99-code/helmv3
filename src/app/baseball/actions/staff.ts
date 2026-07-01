'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/staff.ts
//
// Wave 11 / packet: decision-room
//
// Server actions for the BaseballHelm coaching-staff layer:
//   - inviteStaff        : create a staff invitation (role + capability set)
//   - revokeStaffInvite  : revoke a pending invitation
//   - resendStaffInvite  : refresh the expiry on a pending invitation
//   - acceptStaffInvite  : an authenticated coach accepts an invite by token
//   - updateStaffCapabilities : edit a staffer's role/capabilities/flags
//   - removeStaff        : mark a staffer removed (non-destructive)
//
// SECURITY MODEL
//   - Every mutation that manages OTHER staff is wrapped in withBaseballAction
//     with requiredCapability: 'can_invite_staff'. Head/primary coaches hold all
//     capabilities implicitly (resolved server-side, never from client input or
//     raw_user_meta_data). RLS on baseball_staff_invitations +
//     baseball_team_coach_staff backstops the in-process check.
//   - acceptStaffInvite is intentionally NOT capability-gated on the team (the
//     accepting user is by definition not yet staff). It is auth-gated, validates
//     the token/expiry/status SERVER-SIDE, requires the invite email to match the
//     accepting user's email, and never trusts a client-supplied team/role.
//   - No destructive writes: invitations and staff rows are status-flipped /
//     upserted, never delete-then-reinsert. Removing a staffer flips status to
//     'removed' (and zeroes capabilities) rather than deleting the row, so the
//     audit/contact history is preserved.
//   - PRIVILEGE-ESCALATION GUARD (Issue #501): holding `can_invite_staff` only
//     lets a coach manage staff — it does NOT let them grant a capability they
//     do not themselves hold. inviteStaff and updateStaffCapabilities both
//     resolve the ACTOR's own capability map (resolveBaseballCapabilities,
//     the app-side mirror of has_baseball_staff_capability) and clamp the
//     candidate write — whether it came from a role preset or an explicit
//     tick — down to that map before it ever reaches the DB. This blocks both
//     escalating another staffer and self-escalating. Head/primary coaches
//     resolve to holding every capability, so the clamp is a no-op for them.
//
// All errors are routed through withBaseballAction's logger and a sanitized
// error is rethrown — raw DB errors never reach the client.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
} from '@/lib/baseball/with-baseball-action';
import {
  BASEBALL_CAPABILITY_KEYS,
  resolveBaseballCapabilities,
  type BaseballCapability,
  type BaseballCapabilityMap,
} from '@/lib/baseball/capabilities';
import {
  getBaseballStaffRolePreset,
  isBaseballStaffRole,
} from '@/lib/types/baseball-staff-roles';
import type {
  BaseballStaffInvitationStatus,
} from '@/lib/types';

// -----------------------------------------------------------------------------
// Shared result shape
// -----------------------------------------------------------------------------

export interface StaffActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

// The capability keys a caller may set when inviting / editing staff. We never
// let a caller flip another staffer to is_head_coach via this path (head-coach
// promotion is an explicit, separate concern), so it is excluded here.
const ASSIGNABLE_CAPABILITY_KEYS: readonly BaseballCapability[] =
  BASEBALL_CAPABILITY_KEYS.filter((k) => k !== 'is_head_coach');

/**
 * Sanitize a client-supplied capability map down to the known, assignable keys,
 * coercing every value to a strict boolean. Unknown keys are dropped; this is
 * the single choke point that prevents a client from smuggling arbitrary jsonb
 * (e.g. is_head_coach) into a capability write.
 */
function sanitizeCapabilities(
  input: Partial<Record<string, unknown>> | null | undefined,
): Record<BaseballCapability, boolean> {
  const out = {} as Record<BaseballCapability, boolean>;
  for (const key of ASSIGNABLE_CAPABILITY_KEYS) {
    out[key] = input?.[key] === true;
  }
  return out;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * PRIVILEGE-ESCALATION GUARD (Issue #501)
 *
 * Cap a candidate capability map (whatever inviteStaff/updateStaffCapabilities
 * is about to write, whether it came from an explicit tick or a role preset)
 * to the ACTOR'S OWN resolved capabilities on this team. A coach — including
 * one who holds `can_invite_staff` — can never grant (to someone else, or to
 * themselves) a capability they do not themselves hold. Head/primary coaches
 * hold every capability implicitly (resolveBaseballCapabilities returns all
 * true for them), so this is a no-op for full-authority actors and only
 * clamps limited staffers. Fail-closed: any assignable key not `true` in the
 * actor's own resolved map is forced to `false` regardless of what was
 * requested.
 */
function clampToActorCapabilities(
  requested: Record<BaseballCapability, boolean>,
  actorCaps: BaseballCapabilityMap,
): Record<BaseballCapability, boolean> {
  const out = {} as Record<BaseballCapability, boolean>;
  for (const key of ASSIGNABLE_CAPABILITY_KEYS) {
    out[key] = requested[key] === true && actorCaps[key] === true;
  }
  return out;
}

/**
 * Resolve the capability bundle for an invite: start from the V11 role preset
 * (when a canonical staff_role is supplied), then OVERLAY any explicit caps the
 * inviter ticked. Explicit `true` grants; explicit `false` is honored as a
 * removal of a preset default. Always sanitized down to assignable keys
 * (is_head_coach can never be set via this path).
 */
function resolveInviteCapabilities(
  staffRole: string | null,
  explicit: Partial<Record<BaseballCapability, boolean>> | null | undefined,
): Record<BaseballCapability, boolean> {
  const preset = getBaseballStaffRolePreset(staffRole);
  const merged: Partial<Record<string, unknown>> = { ...preset };
  if (explicit) {
    for (const key of ASSIGNABLE_CAPABILITY_KEYS) {
      if (key in explicit) merged[key] = explicit[key];
    }
  }
  return sanitizeCapabilities(merged);
}

// =============================================================================
// inviteStaff — create a staff invitation for the active team.
// =============================================================================

export interface InviteStaffArgs {
  email: string;
  role?: string | null;
  /** Canonical V11 staff role (head_coach, strength_coach, ...). Drives the
   *  default capability preset; explicit `capabilities` overlay on top. */
  staffRole?: string | null;
  /** Optional free-text title shown on the staff roster. */
  title?: string | null;
  capabilities?: Partial<Record<BaseballCapability, boolean>>;
}

export const inviteStaff = withBaseballAction(
  'inviteStaff',
  { featureArea: 'baseball-staff', requiredCapability: 'can_invite_staff' },
  async (ctx, args: InviteStaffArgs): Promise<StaffActionResult<{ token: string }>> => {
    const email = (args.email ?? '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return { success: false, error: 'Enter a valid email address.' };
    }

    const supabase = await createClient();
    // Canonical V11 staff role (if one of the 12); free-text role kept separately.
    const staffRole = isBaseballStaffRole(args.staffRole) ? args.staffRole : null;
    const title =
      typeof args.title === 'string' && args.title.trim() ? args.title.trim() : null;
    // Capabilities = role preset overlaid with any explicit ticks, then clamped
    // (Issue #501) so the inviter can never grant a capability — via preset or
    // explicit tick — that they do not themselves hold on this team.
    const actorCaps = await resolveBaseballCapabilities(ctx.targetTeamId);
    const capabilities = clampToActorCapabilities(
      resolveInviteCapabilities(staffRole, args.capabilities),
      actorCaps,
    );
    const role =
      typeof args.role === 'string' && args.role.trim()
        ? args.role.trim()
        : staffRole;

    // Guard: do not invite an email that is already active staff on this team.
    const { data: existingStaff } = await fromUntyped(supabase, 'baseball_team_coach_staff')
      .select('id, status, baseball_coaches!inner(email)')
      .eq('team_id', ctx.targetTeamId)
      .ilike('baseball_coaches.email', email)
      .maybeSingle();

    if (
      existingStaff &&
      (existingStaff.status === null || existingStaff.status === 'active')
    ) {
      return {
        success: false,
        error: 'That coach is already on your staff.',
      };
    }

    // Stage-and-swap: if a pending invite already exists for this email+team,
    // refresh it in place instead of inserting a duplicate (non-destructive).
    const { data: priorInvite } = await fromUntyped(supabase, 'baseball_staff_invitations')
      .select('id, token')
      .eq('team_id', ctx.targetTeamId)
      .ilike('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (priorInvite) {
      const { error: updErr } = await fromUntyped(supabase, 'baseball_staff_invitations')
        .update({
          role,
          staff_role: staffRole,
          title,
          capabilities,
          invited_by: ctx.activeCoachId,
          expires_at: new Date(
            Date.now() + 14 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        })
        .eq('id', priorInvite.id);
      if (updErr) {
        return { success: false, error: 'Could not refresh the invitation.' };
      }
      revalidatePath('/baseball/dashboard/settings/staff');
      return { success: true, data: { token: String(priorInvite.token) } };
    }

    // Insert a fresh invitation. token/status/expires_at have SQL defaults; we
    // let the DB mint the token so it is never client-controllable.
    const { data: inserted, error: insErr } = await fromUntyped(supabase, 'baseball_staff_invitations')
      .insert({
        team_id: ctx.targetTeamId,
        email,
        role,
        staff_role: staffRole,
        title,
        capabilities,
        invited_by: ctx.activeCoachId,
      })
      .select('token')
      .single();

    if (insErr || !inserted) {
      return { success: false, error: 'Could not create the invitation.' };
    }

    revalidatePath('/baseball/dashboard/settings/staff');
    return { success: true, data: { token: String(inserted.token) } };
  },
);

// =============================================================================
// revokeStaffInvite — revoke a pending invitation (status -> 'revoked').
// =============================================================================

export const revokeStaffInvite = withBaseballAction(
  'revokeStaffInvite',
  { featureArea: 'baseball-staff', requiredCapability: 'can_invite_staff' },
  async (ctx, args: { invitationId: string }): Promise<StaffActionResult> => {
    if (!args.invitationId) {
      return { success: false, error: 'Missing invitation.' };
    }
    const supabase = await createClient();

    // Scope the update to the active team so a caller can never revoke another
    // team's invite even if they pass a foreign id. RLS also enforces this.
    const { error } = await fromUntyped(supabase, 'baseball_staff_invitations')
      .update({ status: 'revoked' as BaseballStaffInvitationStatus })
      .eq('id', args.invitationId)
      .eq('team_id', ctx.targetTeamId)
      .eq('status', 'pending');

    if (error) {
      return { success: false, error: 'Could not revoke the invitation.' };
    }
    revalidatePath('/baseball/dashboard/settings/staff');
    return { success: true };
  },
);

// =============================================================================
// resendStaffInvite — refresh expiry on a pending invitation.
// =============================================================================

export const resendStaffInvite = withBaseballAction(
  'resendStaffInvite',
  { featureArea: 'baseball-staff', requiredCapability: 'can_invite_staff' },
  async (
    ctx,
    args: { invitationId: string },
  ): Promise<StaffActionResult<{ token: string }>> => {
    if (!args.invitationId) {
      return { success: false, error: 'Missing invitation.' };
    }
    const supabase = await createClient();

    const { data, error } = await fromUntyped(supabase, 'baseball_staff_invitations')
      .update({
        expires_at: new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .eq('id', args.invitationId)
      .eq('team_id', ctx.targetTeamId)
      .eq('status', 'pending')
      .select('token')
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: 'Could not refresh the invitation.' };
    }
    revalidatePath('/baseball/dashboard/settings/staff');
    return { success: true, data: { token: String(data.token) } };
  },
);

// =============================================================================
// acceptStaffInvite — an authenticated coach accepts an invitation by token.
//
// NOT capability-gated (the accepting user is not yet staff). Auth-gated, and
// every trust boundary is validated server-side:
//   - token must resolve to a pending, unexpired invitation
//   - the invite email must match the accepting user's email (case-insensitive)
//   - the accepting user must have a baseball_coaches profile
//   - the staff row is UPSERTed (stage-and-swap on (team_id, coach_id)); no
//     delete-then-insert
//   - capabilities/role come from the SERVER-stored invitation, never the client
// =============================================================================

export interface AcceptStaffInviteResult {
  success: boolean;
  error?: string;
  teamId?: string;
  needsCoachProfile?: boolean;
}

export async function acceptStaffInvite(
  token: string,
): Promise<AcceptStaffInviteResult> {
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Invalid invitation link.' };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new BaseballUnauthorizedError();
  }

  // Resolve the invitation by token. RLS's invitee_select policy already limits
  // an authenticated user to pending/unexpired invites addressed to their own
  // email, but we re-validate every field here regardless.
  const { data: invite } = await fromUntyped(supabase, 'baseball_staff_invitations')
    .select('id, team_id, email, role, capabilities, status, expires_at')
    .eq('token', token)
    .maybeSingle();

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
    return { success: false, error: 'This invitation has expired.' };
  }

  // The invite must be addressed to the accepting user's own email.
  const userEmail = (user.email ?? '').trim().toLowerCase();
  if (!userEmail || userEmail !== String(invite.email).trim().toLowerCase()) {
    return {
      success: false,
      error:
        'This invitation was sent to a different email address. Sign in with the invited account.',
    };
  }

  // The accepting user must already have a coach profile to join staff. (The
  // RPC re-checks this; we check first to return the friendly needsCoachProfile
  // branch the join UI keys off of.)
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!coach) {
    return {
      success: false,
      error: 'Finish setting up your coach profile, then accept the invite.',
      needsCoachProfile: true,
    };
  }

  // The accepting coach does NOT yet hold write authority on
  // baseball_team_coach_staff, so the staff-row UPSERT cannot run under RLS.
  // Delegate to the SECURITY DEFINER RPC, which re-validates every boundary
  // (token / status / expiry / email match) inside the definer body and
  // performs the UPSERT + status flip atomically. Capabilities/role come from
  // the stored invitation only — never from the client.
  const { data, error } = (await supabase.rpc(
    'baseball_accept_staff_invite' as never,
    { p_token: token } as never,
  )) as { data: unknown; error: unknown };

  if (error) {
    return { success: false, error: 'Could not add you to this staff.' };
  }

  const result = (data ?? {}) as { ok?: boolean; reason?: string; team_id?: string };
  if (!result.ok) {
    const reasonMessage: Record<string, string> = {
      invalid: 'This invitation is invalid or has expired.',
      not_pending: 'This invitation is no longer active.',
      expired: 'This invitation has expired.',
      wrong_email:
        'This invitation was sent to a different email address. Sign in with the invited account.',
      no_coach: 'Finish setting up your coach profile, then accept the invite.',
      unauthorized: 'You must be signed in.',
    };
    return {
      success: false,
      error: reasonMessage[result.reason ?? ''] ?? 'Could not accept this invitation.',
      needsCoachProfile: result.reason === 'no_coach',
    };
  }

  revalidatePath('/baseball/dashboard/settings/staff');
  revalidatePath('/baseball/dashboard');
  return { success: true, teamId: result.team_id ?? String(invite.team_id) };
}

// =============================================================================
// updateStaffCapabilities — edit an existing staffer's role/capabilities.
// =============================================================================

export interface UpdateStaffCapabilitiesArgs {
  staffId: string;
  role?: string | null;
  /** Canonical V11 staff role; persisted to staff_role (drives the role_changed
   *  audit event). When provided AND no explicit capabilities are passed, the
   *  role's preset is applied. */
  staffRole?: string | null;
  capabilities: Partial<Record<BaseballCapability, boolean>>;
}

export const updateStaffCapabilities = withBaseballAction(
  'updateStaffCapabilities',
  { featureArea: 'baseball-staff', requiredCapability: 'can_invite_staff' },
  async (
    ctx,
    args: UpdateStaffCapabilitiesArgs,
  ): Promise<StaffActionResult> => {
    if (!args.staffId) {
      return { success: false, error: 'Missing staff member.' };
    }
    const supabase = await createClient();

    // Never let this path edit the team's primary coach or a head coach's
    // capabilities — they hold full authority by definition. Re-read the target
    // row (scoped to the active team) before writing.
    const { data: target } = await fromUntyped(supabase, 'baseball_team_coach_staff')
      .select('id, is_primary, is_head_coach')
      .eq('id', args.staffId)
      .eq('team_id', ctx.targetTeamId)
      .maybeSingle();

    if (!target) {
      return { success: false, error: 'That staff member is not on this team.' };
    }
    if (target.is_primary === true || target.is_head_coach === true) {
      return {
        success: false,
        error: 'The head coach already has full access and cannot be edited here.',
      };
    }

    const staffRole = isBaseballStaffRole(args.staffRole) ? args.staffRole : null;
    const hasExplicitCaps =
      args.capabilities && Object.keys(args.capabilities).length > 0;
    // If a role is set with no explicit caps, apply that role's preset; otherwise
    // overlay explicit caps onto the (possibly-null-role) preset.
    const candidateCaps = hasExplicitCaps
      ? resolveInviteCapabilities(staffRole, args.capabilities)
      : sanitizeCapabilities(getBaseballStaffRolePreset(staffRole));
    // PRIVILEGE-ESCALATION GUARD (Issue #501): clamp to the actor's own
    // resolved capabilities on this team, whether they are editing another
    // staffer or (non-head-coach) themselves — a limited staffer can never
    // grant, or self-grant, a capability they do not hold.
    const actorCaps = await resolveBaseballCapabilities(ctx.targetTeamId);
    const caps = clampToActorCapabilities(candidateCaps, actorCaps);
    const role =
      typeof args.role === 'string'
        ? args.role.trim() || null
        : undefined;

    const payload: Record<string, unknown> = { ...caps };
    if (role !== undefined) payload.role = role;
    if (args.staffRole !== undefined) payload.staff_role = staffRole;

    const { error } = await fromUntyped(supabase, 'baseball_team_coach_staff')
      .update(payload)
      .eq('id', args.staffId)
      .eq('team_id', ctx.targetTeamId);

    if (error) {
      return { success: false, error: 'Could not update this staff member.' };
    }
    revalidatePath('/baseball/dashboard/settings/staff');
    return { success: true };
  },
);

// =============================================================================
// removeStaff — mark a staffer removed (non-destructive) + zero capabilities.
// =============================================================================

export const removeStaff = withBaseballAction(
  'removeStaff',
  { featureArea: 'baseball-staff', requiredCapability: 'can_invite_staff' },
  async (ctx, args: { staffId: string }): Promise<StaffActionResult> => {
    if (!args.staffId) {
      return { success: false, error: 'Missing staff member.' };
    }
    const supabase = await createClient();

    const { data: target } = await fromUntyped(supabase, 'baseball_team_coach_staff')
      .select('id, is_primary, is_head_coach')
      .eq('id', args.staffId)
      .eq('team_id', ctx.targetTeamId)
      .maybeSingle();

    if (!target) {
      return { success: false, error: 'That staff member is not on this team.' };
    }
    if (target.is_primary === true || target.is_head_coach === true) {
      return { success: false, error: 'The head coach cannot be removed.' };
    }

    // Non-destructive: status -> 'removed' and revoke every capability. The row
    // (and its history) is preserved; re-accepting an invite reactivates it.
    const zeroed = sanitizeCapabilities(undefined);
    const { error } = await fromUntyped(supabase, 'baseball_team_coach_staff')
      .update({ status: 'removed', ...zeroed })
      .eq('id', args.staffId)
      .eq('team_id', ctx.targetTeamId);

    if (error) {
      return { success: false, error: 'Could not remove this staff member.' };
    }
    revalidatePath('/baseball/dashboard/settings/staff');
    return { success: true };
  },
);
