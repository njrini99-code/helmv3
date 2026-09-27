import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveCoachActiveTeamId } from '@/lib/golf/resolve-team';
import { ACTIVE_TEAM_COOKIE } from '@/app/golf/actions/team-switcher.constants';

/**
 * Request-scoped (React `cache()`) reads shared by the golf dashboard layout
 * and the pages rendered under it.
 *
 * Next renders a layout and its page in the same request, and both used to
 * resolve the same facts separately: the coach's active team (cookie +
 * staff-row validation, 1–3 queries) and the player's active team membership
 * (1 query). On a shared, fragile production database that is duplicated
 * load on every hard navigation. `cache()` keys on arguments by value for
 * primitives, so every caller here passes primitives only and gets its own
 * server Supabase client internally — the same RLS-scoped client the callers
 * were creating themselves, for the same signed-in user.
 *
 * Outside a React server render (server actions, tests) `cache()` simply calls
 * through, so behaviour there is unchanged.
 */

/** The raw `golf_active_team` cookie value (unvalidated), or null. */
export const readActiveTeamCookie = cache(async (): Promise<string | null> => {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
  } catch {
    // `cookies()` throws outside a request scope.
    return null;
  }
});

/**
 * The coach's active team id for this request — identical resolution to
 * `resolveCoachTeamIdWithCookie` (cookie validated against staff rows, then
 * staffed team, then the org resolver), memoised per request.
 */
export const resolveCoachActiveTeamIdForRequest = cache(
  async (organizationId: string | null, coachId: string | null): Promise<string | null> => {
    const [supabase, cookieTeamId] = await Promise.all([createClient(), readActiveTeamCookie()]);
    return resolveCoachActiveTeamId(supabase, organizationId, coachId, cookieTeamId);
  },
);

/**
 * The player's ACTIVE team membership, with the team name. Returns the raw
 * supabase-js `{ data, error }` so each caller keeps its own failure policy
 * (the layout logs and renders on; the dashboard home throws to its error
 * boundary).
 */
export const getActivePlayerTeamMembership = cache(async (playerId: string) => {
  const supabase = await createClient();
  return supabase
    .from('golf_team_members')
    .select('team_id, golf_teams(id, name)')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();
});
