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
    const { data, error } = await admin
      .from('golf_team_members')
      .select('golf_teams(gender)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !data) return DEFAULT_COHORT;

    const team = (data as { golf_teams: { gender: string | null } | null }).golf_teams;
    const gender: CohortGender = team?.gender === 'womens' ? 'womens' : 'mens';
    return { gender, level: null };
  } catch (err) {
    await logServerError(
      `loadPlayerCohort failed for player=${playerId}: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.counterfactual.loadPlayerCohort' },
    );
    return DEFAULT_COHORT;
  }
}
