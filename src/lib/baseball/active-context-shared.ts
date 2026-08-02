// =============================================================================
// active-context-shared.ts
//
// Non-action exports for the baseball active-team context. These live OUTSIDE
// active-context.ts because that file is marked `'use server'`, and a
// 'use server' module may only export async server actions — exporting a const
// or a type from it breaks the build. Importers can pull these freely from
// either server or client code.
// =============================================================================

/** Cookie that holds the user's currently-selected baseball team id. */
export const ACTIVE_BASEBALL_TEAM_COOKIE = 'active_baseball_team';

/** How the user is related to the active team. */
export type ActiveBaseballRole = 'player' | 'coach';

/**
 * Resolved active-team context for the current request. `null` is only returned
 * (by getActiveBaseballContext) when the user is unauthenticated or has no
 * baseball team memberships at all.
 */
export interface ActiveBaseballContext {
  userId: string;
  /** The resolved, server-validated active team id. */
  activeTeamId: string;
  /** Role the user holds on the active team. */
  activeRole: ActiveBaseballRole;
  /** baseball_players.id when the user is a player on the active team. */
  activePlayerId: string | null;
  /** baseball_coaches.id when the user is staff on the active team. */
  activeCoachId: string | null;
  /** True when the cookie pointed at a team the user is NOT a member of and we
   *  fell back to their first team — the caller should route to a team switcher. */
  fellBackFromStale: boolean;
}

/** Result of attempting to set the active team. */
export interface SetActiveBaseballTeamResult {
  success: boolean;
  error?: string;
}
