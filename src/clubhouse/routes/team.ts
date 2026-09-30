import 'server-only';
import type { GolfSessionProfile } from '@/lib/auth/session';
import { getActivePlayerTeamMembership, resolveCoachActiveTeamIdForRequest } from '@/lib/golf/dashboard-request-cache';
import { chLogServer } from '../lib/track-server';

/**
 * The team a Clubhouse route works in, from the same request-scoped
 * resolvers the dashboard layout already used (so this is a cache hit).
 */
export async function resolveClubhouseTeam(
  session: GolfSessionProfile,
): Promise<{ role: 'coach'; teamId: string; coachId: string } | { role: 'player'; teamId: string; playerId: string } | null> {
  if (session.coach) {
    const teamId = await resolveCoachActiveTeamIdForRequest(session.coach.organization_id ?? null, session.coach.id);
    return teamId ? { role: 'coach', teamId, coachId: session.coach.id } : null;
  }
  if (session.player) {
    const { data, error } = await getActivePlayerTeamMembership(session.player.id);
    if (error) {
      // A failed read is never "no team": the route error view offers a retry instead.
      chLogServer('route', 'playerTeam', error, 'teams');
      throw new Error('Clubhouse: the player team membership read failed');
    }
    const teamId = (data as { team_id?: string } | null)?.team_id;
    return teamId ? { role: 'player', teamId, playerId: session.player.id } : null;
  }
  return null;
}
