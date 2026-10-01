import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoster } from '../data/roster';
import { Roster } from '../screens/roster/Roster';
import { RosterNoTeam } from '../screens/roster/RosterNoTeam';
import { resolveClubhouseTeam } from './team';

/**
 * /golf/dashboard/roster in Clubhouse, for coaches only. The page checks the
 * role and the flag before it gets here; this checks the coach again, so a
 * player's session can never reach the loader. The loader reads the coach's
 * active team and the coach's own notes; the join requests come through
 * getTeamJoinRequests, which answers only for the coach's team.
 */
export async function ClubhouseRosterRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team || team.role !== 'coach') return <RosterNoTeam />;
  return <Roster data={await loadRoster({ teamId: team.teamId, coachId: team.coachId })} />;
}
