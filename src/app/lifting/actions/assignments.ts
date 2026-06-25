'use server';

// =============================================================================
// src/app/lifting/actions/assignments.ts
//
// W2-A — Helm Lifting Lab: team assignment + athlete sync actions.
//
// assignLiftingTeam
//   — Wrapper around the `helm_lifting_assign_team` SECURITY DEFINER RPC.
//     Adds or activates a coach-team assignment for a given sport + team_id.
//     Only an active lifting coach for the org may call this.
//
// syncOrgAthletes
//   — Wrapper around the `helm_lifting_sync_org_athletes` SECURITY DEFINER RPC.
//     Seeds / refreshes helm_lifting_athletes for all current roster members
//     across the org's active teams. Idempotent (ON CONFLICT DO NOTHING on the
//     UNIQUE athlete constraint).
//
// Both RPCs perform their own auth/permission checks inside the definer body.
// The wrappers add the withLiftingAction auth + org context gate so raw
// RPC errors never propagate to the client.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withLiftingAction } from '@/lib/lifting/with-lifting-action';
import type { HelmLiftingSport } from '@/lib/types/helm-lifting';

// ─── Shared result ────────────────────────────────────────────────────────────

export interface AssignmentResult {
  success: boolean;
  error?: string;
  /** RPC-returned assignment id when applicable. */
  assignmentId?: string;
}

export interface SyncAthletesResult {
  success: boolean;
  error?: string;
  /** Count of athlete rows seeded or already present (returned by RPC). */
  athleteCount?: number;
}

// =============================================================================
// assignLiftingTeam
// =============================================================================

export interface AssignLiftingTeamArgs {
  /** The org_id context (also encoded in the RPC args for the definer). */
  orgId: string;
  sport: HelmLiftingSport;
  /** baseball_teams.id or golf_teams.id — soft ref. */
  teamId: string;
  /** Optional display snapshot (e.g. "Varsity Baseball"). */
  teamNameSnapshot?: string | null;
}

/**
 * Assign (or reactivate) the current active lifting coach to a sport team.
 *
 * Delegates to the `helm_lifting_assign_team` SECURITY DEFINER RPC which:
 *   1. Re-validates the caller is an active lifting coach for the org.
 *   2. Verifies the team_id belongs to the org's sport table.
 *   3. UPSERTs helm_lifting_coach_assignments (idempotent on UNIQUE constraint).
 *   4. Triggers helm_lifting_sync_org_athletes for the new team (seeds athletes).
 */
export const assignLiftingTeam = withLiftingAction(
  'assignLiftingTeam',
  {
    featureArea: 'lifting-assignments',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as AssignLiftingTeamArgs).orgId,
  },
  async (ctx, input: AssignLiftingTeamArgs): Promise<AssignmentResult> => {
    if (!input.teamId) {
      return { success: false, error: 'Team ID is required.' };
    }
    if (!input.sport || !(['baseball', 'golf'] as const).includes(input.sport)) {
      return { success: false, error: 'Invalid sport.' };
    }

    const supabase = await createClient();

    const { data: rpcData, error: rpcErr } = (await supabase.rpc(
      'helm_lifting_assign_team' as never,
      {
        p_org_id: ctx.orgId,
        p_sport: input.sport,
        p_team_id: input.teamId,
        p_team_name: input.teamNameSnapshot ?? null,
      } as never,
    )) as { data: unknown; error: unknown };

    if (rpcErr) {
      return { success: false, error: 'Could not assign team. Please try again.' };
    }

    const result = (rpcData ?? {}) as {
      ok?: boolean;
      reason?: string;
      assignment_id?: string;
    };

    if (!result.ok) {
      const reasonMessages: Record<string, string> = {
        unauthorized: 'You do not have permission to assign teams.',
        invalid_team: 'This team does not belong to your organization.',
        no_coach: 'Active lifting coach not found for this organization.',
      };
      return {
        success: false,
        error:
          reasonMessages[result.reason ?? ''] ?? 'Could not assign team. Please try again.',
      };
    }

    revalidatePath('/lifting/dashboard');
    revalidatePath('/lifting/dashboard/settings');
    return { success: true, assignmentId: result.assignment_id };
  },
);

// =============================================================================
// syncOrgAthletes
// =============================================================================

export interface SyncOrgAthletesArgs {
  orgId: string;
  /**
   * Optional: limit the sync to a single sport. When omitted the RPC seeds
   * athletes for ALL sports in the org.
   */
  sport?: HelmLiftingSport | null;
}

/**
 * Seed / refresh helm_lifting_athletes for the org's current rosters.
 *
 * Delegates to the `helm_lifting_sync_org_athletes` SECURITY DEFINER RPC.
 * Safe to call repeatedly — the RPC uses ON CONFLICT DO NOTHING on the UNIQUE
 * (organization_id, sport, sport_player_id) constraint.
 *
 * Returns the count of athlete rows now present (seeded + pre-existing).
 */
export const syncOrgAthletes = withLiftingAction(
  'syncOrgAthletes',
  {
    featureArea: 'lifting-assignments',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as SyncOrgAthletesArgs).orgId,
  },
  async (ctx, input: SyncOrgAthletesArgs): Promise<SyncAthletesResult> => {
    const supabase = await createClient();

    const { data: rpcData, error: rpcErr } = (await supabase.rpc(
      'helm_lifting_sync_org_athletes' as never,
      {
        p_org_id: ctx.orgId,
        p_sport: input.sport ?? null,
      } as never,
    )) as { data: unknown; error: unknown };

    if (rpcErr) {
      return { success: false, error: 'Could not sync athletes. Please try again.' };
    }

    const result = (rpcData ?? {}) as {
      ok?: boolean;
      reason?: string;
      athlete_count?: number;
    };

    if (!result.ok) {
      return {
        success: false,
        error: result.reason === 'unauthorized'
          ? 'You do not have permission to sync athletes.'
          : 'Could not sync athletes. Please try again.',
      };
    }

    revalidatePath('/lifting/dashboard/athletes');
    return { success: true, athleteCount: result.athlete_count };
  },
);
