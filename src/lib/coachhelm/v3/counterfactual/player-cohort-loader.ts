/**
 * Resolve a player's cohort (team gender) for the counterfactual's per-gender
 * anchor selection. Resolution mirrors generator-toggles.ts:
 * playerId → active golf_team_members → golf_teams.gender.
 *
 * Fails SAFE to mens / null level — a lookup failure must never throw into a
 * cron generator run, and men's is the unchanged-behavior default.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import type { CohortGender } from './cohort-baselines';

export interface PlayerCohort {
  gender: CohortGender;
  /** Division tier when known; null this phase (golf_teams has no division col). */
  level: string | null;
}

const DEFAULT_COHORT: PlayerCohort = { gender: 'mens', level: null };

export async function loadPlayerCohort(playerId: string): Promise<PlayerCohort> {
  try {
    const admin = createAdminClient();
    // List (NOT .maybeSingle()) so a data anomaly of 2+ active memberships can
    // never throw PGRST116 and silently fall back to men's. A player should have
    // exactly one active membership (enforced in joinGolfTeam), but if any active
    // team is women's, classify women's deterministically.
    const { data, error } = await admin
      .from('golf_team_members')
      .select('golf_teams(gender)')
      .eq('player_id', playerId)
      .eq('status', 'active');
    if (error || !data || data.length === 0) return DEFAULT_COHORT;

    const rows = data as Array<{ golf_teams: { gender: string | null } | null }>;
    const gender: CohortGender = rows.some((r) => r.golf_teams?.gender === 'womens')
      ? 'womens'
      : 'mens';
    return { gender, level: null };
  } catch (err) {
    await logServerError(
      `loadPlayerCohort failed for player=${playerId}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.counterfactual.loadPlayerCohort' },
    );
    return DEFAULT_COHORT;
  }
}
