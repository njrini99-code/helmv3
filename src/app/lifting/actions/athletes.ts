'use server';

// =============================================================================
// src/app/lifting/actions/athletes.ts
//
// Server actions for the Lifting Lab athlete roster.
//
// PREVIOUS BUG (fixed 2026-07-29, Team C): syncOrgAthletes called the
// `helm_lifting_sync_org_athletes` RPC with a parameter name it doesn't have
// (`p_org_id` — the real parameter is `p_org`) and, worse, never checked the
// RPC call's `error` result at all. PostgREST rejects the mismatched call as
// "function not found", but because that error was silently discarded this
// action ALWAYS returned `{ success: true }` — a false-success toast
// ("Athletes synced.") over a genuine no-op that inserted zero rows.
//
// FIX: delegate to the real, fixed implementation in ./assignments.ts, which
// correctly calls the RPC per its actual 3-arg signature
// (p_org, p_sport, p_team_id — the RPC is PER-TEAM, not org-wide) by looping
// the org's active team assignments, and reports real counts
// (syncedCount / teamsSynced / athleteCount) rather than a fixed string.
// Kept as a distinct export (rather than having callers import from
// assignments.ts directly) because AthleteRosterClient.tsx calls this with a
// bare `orgId: string`, not the `{ orgId, sport?, teamId? }` args shape the
// assignments.ts action takes.
// =============================================================================

import { syncOrgAthletes as syncOrgAthletesForOrg } from './assignments';

export interface SyncAthletesResult {
  success: boolean;
  error?: string;
  /** Total helm_lifting_athletes rows now present for the org (seeded + pre-existing). */
  athleteCount?: number;
  /** Rows the RPC inserted or updated on this call — 0 on a genuine no-op. See assignments.ts for why "or updated". */
  syncedCount?: number;
  /** How many active team assignments were targeted by this sync. */
  teamsSynced?: number;
}

export async function syncOrgAthletes(orgId: string): Promise<SyncAthletesResult> {
  if (!orgId) {
    return { success: false, error: 'Missing organization.' };
  }
  try {
    // The delegated action is wrapped in withLiftingAction, which enforces
    // auth + edit access and calls revalidatePath('/lifting/dashboard/athletes')
    // on a successful sync — no duplicated logic here.
    return await syncOrgAthletesForOrg({ orgId });
  } catch (err) {
    // withLiftingAction THROWS on auth/access/unexpected failures (it does
    // not return { success: false }) — but this action's only caller
    // (AthleteRosterClient.tsx) does not wrap its call in try/catch, so an
    // unhandled rejection here would surface as an uncaught client error
    // rather than the honest inline failure message the UI expects. Normalize
    // to a returned failure instead.
    const message = err instanceof Error ? err.message : 'Sync failed. Try again.';
    return { success: false, error: message };
  }
}
