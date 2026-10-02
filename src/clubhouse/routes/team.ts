import 'server-only';
import type { GolfSessionProfile } from '@/lib/auth/session';
import { getActivePlayerTeamMembership, resolveCoachActiveTeamForRequest } from '@/lib/golf/dashboard-request-cache';
import { chLogServer } from '../lib/track-server';

/**
 * The team a Clubhouse route works in, from the same request-scoped
 * resolvers the dashboard layout already used (so this is a cache hit).
 */
export async function resolveClubhouseTeam(
  session: GolfSessionProfile,
): Promise<{ role: 'coach'; teamId: string; coachId: string } | { role: 'player'; teamId: string; playerId: string } | null> {
  if (session.coach) {
    const team = await resolveCoachActiveTeamForRequest(session.coach.organization_id ?? null, session.coach.id);
    // A read that failed is never "not on a team yet" and never a guessed team: the route error view retries.
    if (team.status === 'failed') {
      chLogServer('route', 'coachTeam', new Error('team resolution read failed'), 'teams');
      throw new Error('Clubhouse: the coach team resolution read failed');
    }
    return team.status === 'ok' ? { role: 'coach', teamId: team.teamId, coachId: session.coach.id } : null;
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
