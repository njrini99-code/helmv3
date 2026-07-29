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
//   — Org-wide orchestrator around the `helm_lifting_sync_org_athletes`
//     SECURITY DEFINER RPC. The RPC itself is PER-TEAM — it requires
//     (p_org, p_sport, p_team_id) all NOT NULL and seeds/refreshes
//     helm_lifting_athletes for that one team's roster only (see
//     supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql).
//     This wrapper resolves every ACTIVE helm_lifting_coach_assignments row
//     for the org (optionally narrowed to one sport and/or one team), calls
//     the RPC once per distinct (sport, team_id) pair, and sums the results.
//     Idempotent — the RPC upserts on the UNIQUE
//     (organization_id, sport, sport_player_id) constraint, so re-running this
//     wrapper re-targets the same team set without duplicating anyone. Since
//     20260729000300 that conflict action REFRESHES identity fields (user_id,
//     names, position) instead of DO NOTHING, so a re-sync repairs an athlete
//     seeded before their account was linked. It still never touches
//     is_active, so a sync cannot resurrect a player a coach cut.
//
// ROOT-CAUSE NOTE (2026-07-29 Team C fix): both this file's original
// syncOrgAthletes AND the sibling athletes.ts syncOrgAthletes called the RPC
// with `p_org_id` — a parameter name the function does not have (the real
// parameter is `p_org`) — and this file additionally omitted the required
// `p_team_id` argument. PostgREST rejects unknown/missing-required named
// parameters as "function not found", which is a real error — but
// athletes.ts never inspected the RPC error at all, so it reported
// `{ success: true }` on every call while inserting zero rows.
// assignLiftingTeam had the identical `p_org_id` typo, so
// helm_lifting_coach_assignments could never gain an active row either,
// which independently guaranteed zero teams for syncOrgAthletes to target.
// Both call sites are fixed below (real param name + real per-team loop +
// real result shape).
//
// Both RPCs perform their own auth/permission checks inside the definer body.
// The wrappers add the withLiftingAction auth + org context gate so raw
// RPC errors never propagate to the client.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction } from '@/lib/lifting/with-lifting-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { HelmLiftingSport } from '@/lib/types/helm-lifting';

// ─── Shared result ────────────────────────────────────────────────────────────

export interface AssignmentResult {
  success: boolean;
  error?: string;
  /** RPC-returned assignment id when applicable. */
  assignmentId?: string;
  /**
   * Athletes seeded into Lift Lab by the follow-up sync this action performs
   * for the newly-assigned team.
   *
   * `number` — the sync ran; this is how many athlete rows it inserted (0 is a
   *   truthful answer: the team's roster is empty, or every athlete already
   *   had a Lift Lab row).
   * `null`   — the sync did NOT run to completion (it failed after the
   *   assignment itself had already succeeded). The team IS assigned; its
   *   athletes are not seeded yet. Callers must not render this as "0
   *   athletes" — that would state a fact we did not establish.
   */
  seededAthleteCount?: number | null;
}

export interface SyncAthletesResult {
  success: boolean;
  error?: string;
  /** Total helm_lifting_athletes rows now present for the org (seeded + pre-existing). */
  athleteCount?: number;
  /**
   * Rows the RPC inserted OR updated on this call — 0 on a genuine no-op,
   * never a fixed string.
   *
   * "or updated" since 20260729000300: the sync upserts identity fields now
   * (it used to be ON CONFLICT DO NOTHING), so a re-sync that repairs a
   * player's account link counts as work done rather than reporting zero.
   * That is the honest reading — something did change — but it does mean a
   * non-zero value no longer implies NEW athletes appeared.
   */
  syncedCount?: number;
  /** How many active team assignments were targeted by this sync. */
  teamsSynced?: number;
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
 * Assign (or reactivate) the current active lifting coach to a sport team,
 * then seed that team's athletes into Lift Lab.
 *
 * `helm_lifting_assign_team` (SECURITY DEFINER) does exactly two things — read
 * the body at
 * supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql:116-161
 * before extending this list:
 *   1. Re-validates the caller is an active lifting coach for the org
 *      (RAISEs `unauthenticated` / `not_a_lifting_coach_for_org`).
 *   2. UPSERTs helm_lifting_coach_assignments (idempotent on the UNIQUE
 *      (coach_id, sport, team_id) constraint; reactivates a soft-deleted row).
 *
 * It does NOT validate that `team_id` names a real team in that sport, and it
 * does NOT seed athletes. This doc comment previously claimed both, which is
 * why the gap below went unnoticed: assigning a team through the settings UI
 * left the coach staring at an empty athlete roster with nothing indicating a
 * separate sync was required.
 *
 * So this action performs the seed itself, calling
 * `helm_lifting_sync_org_athletes` for the (org, sport, team) just assigned.
 * The seed is BEST-EFFORT: the assignment is already committed by the time it
 * runs, so a seed failure must not turn a successful assignment into a
 * reported failure. It is reported instead via `seededAthleteCount: null`,
 * which the caller renders differently from a genuine `0`.
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

    // helm_lifting_assign_team(p_org uuid, p_sport text, p_team_id uuid,
    //   p_team_name text DEFAULT NULL) RETURNS uuid — the parameter is
    // `p_org`, NOT `p_org_id`, and the function returns the assignment's raw
    // uuid on success or RAISE EXCEPTIONs on failure (no soft `{ok,reason}`
    // jsonb envelope — that shape was never what this RPC returns).
    const { data: rpcData, error: rpcErr } = (await supabase.rpc(
      'helm_lifting_assign_team' as never,
      {
        p_org: ctx.orgId,
        p_sport: input.sport,
        p_team_id: input.teamId,
        p_team_name: input.teamNameSnapshot ?? null,
      } as never,
    )) as { data: string | null; error: { message?: string } | null };

    if (rpcErr) {
      const message = rpcErr.message ?? '';
      const reasonMessages: Record<string, string> = {
        unauthenticated: 'You must be signed in.',
        not_a_lifting_coach_for_org: 'Active lifting coach not found for this organization.',
      };
      const matchedReason = Object.keys(reasonMessages).find((key) => message.includes(key));
      return {
        success: false,
        error: matchedReason ? reasonMessages[matchedReason] : 'Could not assign team. Please try again.',
      };
    }

    if (!rpcData) {
      return { success: false, error: 'Could not assign team. Please try again.' };
    }

    // Seed the newly-assigned team's roster into Lift Lab. Called directly
    // rather than through syncOrgAthletes() because the (sport, team_id) pair
    // is already known here — re-deriving it by re-querying
    // helm_lifting_coach_assignments would only add a round trip and a race
    // against the UPSERT that just happened.
    //
    // Best-effort by construction: the assignment above is already committed.
    // Failing the whole action now would tell the coach the team wasn't added
    // when it was, and a retry would be a no-op that still reported failure.
    let seededAthleteCount: number | null = null;
    try {
      const { data: syncData, error: syncErr } = (await supabase.rpc(
        'helm_lifting_sync_org_athletes' as never,
        {
          p_org: ctx.orgId,
          p_sport: input.sport,
          p_team_id: input.teamId,
        } as never,
      )) as { data: number | null; error: { message?: string } | null };

      if (syncErr) {
        await logServerError(
          `Lift Lab athlete seed failed after assigning ${input.sport} team ${input.teamId}: ${describeError(syncErr)}`,
          {
            action: 'assignLiftingTeam.seedAthletes',
            featureArea: 'lifting-assignments',
            teamId: input.teamId,
            sport: input.sport,
          },
        );
      } else {
        seededAthleteCount = typeof syncData === 'number' ? syncData : 0;
      }
    } catch (error) {
      await logServerError(
        `Lift Lab athlete seed threw after assigning ${input.sport} team ${input.teamId}: ${describeError(error)}`,
        {
          action: 'assignLiftingTeam.seedAthletes',
          featureArea: 'lifting-assignments',
          teamId: input.teamId,
          sport: input.sport,
        },
      );
    }

    revalidatePath('/lifting/dashboard');
    revalidatePath('/lifting/dashboard/settings');
    revalidatePath('/lifting/dashboard/athletes');
    return { success: true, assignmentId: rpcData, seededAthleteCount };
  },
);

// =============================================================================
// syncOrgAthletes
// =============================================================================

export interface SyncOrgAthletesArgs {
  orgId: string;
  /**
   * Optional: limit the sync to a single sport. When omitted, every active
   * team assignment for the org (any sport) is synced.
   */
  sport?: HelmLiftingSport | null;
  /**
   * Optional: limit the sync to a single team (matched together with
   * `sport` when both are given). When omitted, every active team
   * assignment matching `sport` (or all of them) is synced.
   */
  teamId?: string | null;
}

interface ActiveAssignmentTarget {
  sport: HelmLiftingSport;
  team_id: string;
}

/**
 * Seed / refresh helm_lifting_athletes for the org's current rosters.
 *
 * The underlying `helm_lifting_sync_org_athletes` RPC is scoped to ONE
 * (org, sport, team_id) at a time — it has no "sync everything" mode. This
 * wrapper resolves the org's ACTIVE helm_lifting_coach_assignments rows
 * (optionally narrowed by `sport`/`teamId`), de-dupes them to distinct
 * (sport, team_id) pairs, and calls the RPC once per pair, summing results.
 *
 * Safe to call repeatedly — the RPC upserts on the UNIQUE
 * (organization_id, sport, sport_player_id) constraint, so re-syncing never
 * duplicates an athlete row, and since 20260729000300 it also repairs a
 * user_id that was NULL at first sync (the state that used to lock a player
 * out of /lifting/dashboard permanently).
 *
 * Reports what actually happened rather than a fixed success string:
 *   - `syncedCount`  — rows newly inserted by THIS call (0 on a no-op)
 *   - `teamsSynced`  — how many active team assignments were targeted
 *   - `athleteCount` — total helm_lifting_athletes rows now present for the org
 *
 * Returns `success: false` (never a bare success toast) if loading the
 * assignment list fails, or if any per-team RPC call errors.
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

    // Resolve which (sport, team_id) pairs to sync from the org's active
    // coach assignments — this is the actual argument set the RPC needs.
    let assignmentQuery = fromUntyped(supabase, 'helm_lifting_coach_assignments')
      .select('sport, team_id')
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      .not('team_id', 'is', null);
    if (input.sport) {
      assignmentQuery = assignmentQuery.eq('sport', input.sport);
    }
    if (input.teamId) {
      assignmentQuery = assignmentQuery.eq('team_id', input.teamId);
    }

    const { data: assignmentRows, error: assignmentErr } = (await assignmentQuery) as {
      data: ActiveAssignmentTarget[] | null;
      error: unknown;
    };

    if (assignmentErr) {
      return { success: false, error: 'Could not load team assignments to sync.' };
    }

    // De-dupe: more than one coach can be assigned to the same team.
    const seen = new Set<string>();
    const targets: ActiveAssignmentTarget[] = [];
    for (const row of assignmentRows ?? []) {
      if (!row.team_id) continue;
      const key = `${row.sport}:${row.team_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(row);
    }

    if (targets.length === 0) {
      // Honest no-op: nothing assigned yet, so nothing to sync. NOT reported
      // as a generic success — the caller sees syncedCount/teamsSynced: 0.
      return { success: true, athleteCount: 0, syncedCount: 0, teamsSynced: 0 };
    }

    let syncedCount = 0;
    let teamsSynced = 0;
    const failedTeamIds: string[] = [];

    for (const target of targets) {
      const { data, error } = (await supabase.rpc(
        'helm_lifting_sync_org_athletes' as never,
        {
          p_org: ctx.orgId,
          p_sport: target.sport,
          p_team_id: target.team_id,
        } as never,
      )) as { data: number | null; error: unknown };

      if (error) {
        failedTeamIds.push(target.team_id);
        continue;
      }
      teamsSynced += 1;
      syncedCount += typeof data === 'number' ? data : 0;
    }

    const { count: athleteCount } = (await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)) as { count: number | null };

    if (failedTeamIds.length > 0) {
      return {
        success: false,
        error:
          teamsSynced > 0
            ? `Synced ${syncedCount} athlete(s) from ${teamsSynced} team(s), but ${failedTeamIds.length} team(s) failed to sync. Please try again.`
            : 'Could not sync athletes. Please try again.',
        athleteCount: athleteCount ?? undefined,
        syncedCount,
        teamsSynced,
      };
    }

    revalidatePath('/lifting/dashboard/athletes');
    return {
      success: true,
      athleteCount: athleteCount ?? undefined,
      syncedCount,
      teamsSynced,
    };
  },
);
