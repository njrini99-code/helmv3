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
import { describeError } from '@/lib/utils/describe-error';

export interface PlayerCohort {
  gender: CohortGender;
  /** Division tier when known; null this phase (golf_teams has no division col). */
  level: string | null;
}

const DEFAULT_COHORT: PlayerCohort = { gender: 'mens', level: null };

function cohortFromRows(rows: Array<{ golf_teams: { gender: string | null } | null }>): PlayerCohort {
  if (rows.length === 0) return DEFAULT_COHORT;
  const gender: CohortGender = rows.some((r) => r.golf_teams?.gender === 'womens')
    ? 'womens'
    : 'mens';
  return { gender, level: null };
}

// Chunk ids per `.in(...)` so a full roster's UUID list stays well under the
// PostgREST / proxy request-URL limit, and one chunk's active memberships
// (about one per player) stay far below the 1,000-row response cap.
const COHORT_PLAYER_BATCH = 150;

/**
 * Batched {@link loadPlayerCohort} for multi-player surfaces (the coach roster
 * via loadPlayersStandingMap). One golf_team_members read per chunk instead of
 * one per player: the per-player fan-out was Sentry JAVASCRIPT-NEXTJS-QK
 * (N+1 on GET /golf/dashboard/roster).
 *
 * Same classification and the same fail-safe as the single-player loader:
 * every requested id gets an entry, and a failed chunk leaves its players on
 * the men's default rather than throwing into a page render.
 */
export async function loadPlayerCohorts(
  playerIds: readonly string[],
): Promise<Map<string, PlayerCohort>> {
  const result = new Map<string, PlayerCohort>();
  const ids = [...new Set(playerIds)];
  for (const id of ids) result.set(id, DEFAULT_COHORT);
  if (ids.length === 0) return result;

  try {
    const admin = createAdminClient();
    for (let i = 0; i < ids.length; i += COHORT_PLAYER_BATCH) {
      const batch = ids.slice(i, i + COHORT_PLAYER_BATCH);
      const { data, error } = await admin
        .from('golf_team_members')
        .select('player_id, golf_teams(gender)')
        .in('player_id', batch)
        .eq('status', 'active');
      if (error || !data) continue;

      const rowsByPlayer = new Map<string, Array<{ golf_teams: { gender: string | null } | null }>>();
      for (const row of data as Array<{
        player_id: string;
        golf_teams: { gender: string | null } | null;
      }>) {
        const list = rowsByPlayer.get(row.player_id) ?? [];
        list.push(row);
        rowsByPlayer.set(row.player_id, list);
      }
      for (const [id, rows] of rowsByPlayer) result.set(id, cohortFromRows(rows));
    }
  } catch (err) {
    await logServerError(
      `loadPlayerCohorts failed for ${ids.length} players: ${describeError(err)}`,
      { action: 'v3.counterfactual.loadPlayerCohorts' },
    );
  }
  return result;
}

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
    if (error || !data) return DEFAULT_COHORT;
    return cohortFromRows(data as Array<{ golf_teams: { gender: string | null } | null }>);
  } catch (err) {
    await logServerError(
      `loadPlayerCohort failed for player=${playerId}: ${describeError(err)}`,
      { action: 'v3.counterfactual.loadPlayerCohort' },
    );
    return DEFAULT_COHORT;
  }
}
