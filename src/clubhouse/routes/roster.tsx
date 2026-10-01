import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoster } from '../data/roster';
import { loadPlayerRoster } from '../data/roster-player';
import { Roster } from '../screens/roster/Roster';
import { RosterNoTeam } from '../screens/roster/RosterNoTeam';
import { TeamRoster } from '../screens/roster/TeamRoster';
import { resolveClubhouseTeam } from './team';

/**
 * /golf/dashboard/roster in Clubhouse. The page checks the role and the flag before it gets here; this checks the
 * session again and chooses the screen by who it is, so a player's session can never reach the coach's loader.
 *
 * A coach gets the coach's roster: it reads the coach's active team and the coach's own notes, and the join
 * requests come through getTeamJoinRequests, which answers only for the coach's team. A player gets their own
 * team's roster, read-only (loadPlayerRoster): names, class years and handicaps, none of that.
 */
export async function ClubhouseRosterRoute() {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  if (session.coach) {
    const team = await resolveClubhouseTeam(session);
    if (!team || team.role !== 'coach') return <RosterNoTeam />;
    return <Roster data={await loadRoster({ teamId: team.teamId, coachId: team.coachId })} />;
  }
  if (session.player) {
    const team = await resolveClubhouseTeam(session);
    if (!team || team.role !== 'player') return <RosterNoTeam viewer="player" />;
    return <TeamRoster data={await loadPlayerRoster({ teamId: team.teamId, playerId: team.playerId })} />;
  }
  return null;
}
