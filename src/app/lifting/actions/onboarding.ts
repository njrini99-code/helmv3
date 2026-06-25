'use server';

// =============================================================================
// src/app/lifting/actions/onboarding.ts
//
// W2-A — Helm Lifting Lab: onboarding + mode-selection actions.
//
// completeLiftingCoachOnboarding
//   — Upserts the helm_lifting_coaches profile row and marks
//     onboarding_completed=true.  Wraps both the initial profile creation
//     (called from the onboarding wizard) and the idempotent "mark complete"
//     signal (called after the dashboard first-run card is dismissed).
//
// setLiftingMode
//   — Called from the baseball/golf coach onboarding Yes/No lifting step (§3.1).
//   — 'no'    → inserts helm_lifting_org_viewers (can_edit=true) for the head
//               coach; they manage lifting without a dedicated lifting coach.
//   — 'yes'   → calls inviteLiftingCoach with the supplied email/title, then
//               also inserts a viewer row so the head coach can edit lifting
//               while the invite is pending.
//   — 'later' → no-op; head coach can set up from Lab settings later.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerException } from '@/lib/server-error-logger';
import { inviteLiftingCoach } from './invites';
import type { HelmLiftingCoachInsert, HelmLiftingSport } from '@/lib/types/helm-lifting';

// ─── completeLiftingCoachOnboarding ─────────────────────────────────────────

export interface CompleteLiftingCoachOnboardingArgs {
  fullName: string;
  title?: string | null;
  organizationId: string;
}

export interface OnboardingResult {
  success: boolean;
  error?: string;
}

/**
 * Upsert the Helm Lifting Lab coach profile and mark onboarding complete.
 *
 * - Creates the helm_lifting_coaches row if it does not yet exist (first-time
 *   after invite accept, where the RPC may have seeded a shell row).
 * - Idempotent on (user_id, organization_id) via ON CONFLICT DO UPDATE — safe
 *   to call multiple times.
 * - Always sets onboarding_completed=true (the caller is the onboarding page;
 *   if the coach is re-visiting they are completing a subsequent pass).
 *
 * Auth: caller must be signed in (validated server-side).
 */
export async function completeLiftingCoachOnboarding(
  args: CompleteLiftingCoachOnboardingArgs,
): Promise<OnboardingResult> {
  const fullName = (args.fullName ?? '').trim();
  const title =
    typeof args.title === 'string' && args.title.trim()
      ? args.title.trim()
      : null;
  const organizationId = (args.organizationId ?? '').trim();

  if (!fullName) {
    return { success: false, error: 'Full name is required.' };
  }
  if (!organizationId) {
    return { success: false, error: 'Organization is required.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in.' };
    }

    const insert: HelmLiftingCoachInsert = {
      user_id: user.id,
      organization_id: organizationId,
      full_name: fullName,
      title,
      email: user.email ?? null,
      status: 'active',
      onboarding_completed: true,
    };

    const { error } = await fromUntyped(supabase, 'helm_lifting_coaches').upsert(
      insert as unknown as Record<string, unknown>,
      {
        onConflict: 'user_id,organization_id',
        ignoreDuplicates: false, // always overwrite with latest profile data
      },
    );

    if (error) {
      await logServerException(
        error instanceof Error ? error : new Error(String(error)),
        {
          action: 'completeLiftingCoachOnboarding',
          featureArea: 'lifting-onboarding',
          source: 'server_action',
          handled: true,
          tags: { sport: 'lifting', feature: 'lifting-onboarding' },
        },
        'error',
      );
      return { success: false, error: 'Failed to save profile. Please try again.' };
    }

    revalidatePath('/lifting/dashboard');
    return { success: true };
  } catch (err) {
    await logServerException(
      err instanceof Error ? err : new Error(String(err)),
      {
        action: 'completeLiftingCoachOnboarding',
        featureArea: 'lifting-onboarding',
        source: 'server_action',
        handled: false,
        tags: { sport: 'lifting', feature: 'lifting-onboarding' },
      },
      'error',
    );
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

// ─── setLiftingMode ──────────────────────────────────────────────────────────

export type LiftingMode = 'yes' | 'no' | 'later';

export interface SetLiftingModeArgs {
  mode: LiftingMode;
  orgId: string;
  /** Sport of the head coach answering the question ('baseball' | 'golf'). */
  sport: HelmLiftingSport;
  /** The team the head coach leads (used as source_team_id in viewer + invite). */
  teamId: string;
  /** Required when mode === 'yes' — email of the lifting coach to invite. */
  inviteEmail?: string | null;
  /** Optional role title for the lifting coach (mode === 'yes' only). */
  inviteRoleTitle?: string | null;
}

export interface SetLiftingModeResult {
  success: boolean;
  error?: string;
  /** Token returned when an invite was sent (mode === 'yes'). */
  inviteToken?: string;
}

/**
 * Respond to the "Do you have a Strength & Conditioning coach?" onboarding step.
 *
 * mode='no'    → Inserts/upserts an org_viewers row with can_edit=true so the
 *               head coach manages lifting themselves without a dedicated coach.
 * mode='yes'   → Inserts an interim viewer row (can_edit=true) then calls
 *               `inviteLiftingCoach`.  When the invitee accepts, the accept RPC
 *               flips can_edit to false (view-only) on all head-coach viewer
 *               rows for the org.
 * mode='later' → No-op; the head coach deferred and can set this up later from
 *               the Lab settings page.
 *
 * Auth: caller must be authenticated.  For mode='yes', authority to invite is
 * additionally verified inside `inviteLiftingCoach`.
 */
export async function setLiftingMode(
  args: SetLiftingModeArgs,
): Promise<SetLiftingModeResult> {
  const { mode, orgId, sport, teamId } = args;

  if (!orgId) return { success: false, error: 'Organization ID is required.' };
  if (!sport || !(['baseball', 'golf'] as const).includes(sport)) {
    return { success: false, error: 'Invalid sport.' };
  }
  if (!teamId) return { success: false, error: 'Team ID is required.' };

  if (mode === 'later') {
    // Deliberate deferral — no DB write needed.
    return { success: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be signed in.' };

  // ── Shared helper: upsert the viewer row ───────────────────────────────────
  const upsertViewerRow = async (canEdit: boolean) => {
    await fromUntyped(supabase, 'helm_lifting_org_viewers').upsert(
      {
        organization_id: orgId,
        user_id: user.id,
        sport,
        source_team_id: teamId,
        granted_by: 'onboarding_no_coach',
        can_edit: canEdit,
      },
      {
        onConflict: 'organization_id,user_id,sport',
        ignoreDuplicates: false, // update can_edit if a prior row exists
      },
    );
  };

  if (mode === 'no') {
    // No-coach mode: head coach manages lifting directly with full edit access.
    const { error: viewErr } = await fromUntyped(supabase, 'helm_lifting_org_viewers')
      .upsert(
        {
          organization_id: orgId,
          user_id: user.id,
          sport,
          source_team_id: teamId,
          granted_by: 'onboarding_no_coach',
          can_edit: true,
        },
        {
          onConflict: 'organization_id,user_id,sport',
          ignoreDuplicates: false,
        },
      );

    if (viewErr) {
      return { success: false, error: 'Could not enable Lifting Lab access.' };
    }

    revalidatePath('/lifting/dashboard');
    return { success: true };
  }

  if (mode === 'yes') {
    const inviteEmail = (args.inviteEmail ?? '').trim();
    if (!inviteEmail) {
      return { success: false, error: "Enter the lifting coach's email address." };
    }

    // Ensure the head coach has an interim viewer row while the invite is pending
    // so lifting is never blocked during the transition.  Idempotent.
    await upsertViewerRow(true);

    // Delegate to inviteLiftingCoach for the full invite + email lifecycle.
    const result = await inviteLiftingCoach({
      email: inviteEmail,
      orgId,
      roleTitle: args.inviteRoleTitle ?? null,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, inviteToken: result.token };
  }

  return { success: false, error: 'Invalid mode.' };
}
