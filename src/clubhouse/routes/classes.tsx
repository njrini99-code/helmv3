import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadClasses } from '../data/classes';
import { Classes } from '../screens/classes/Classes';
import { ClassesNoTeam } from '../screens/classes/ClassesNoTeam';
import { resolveClubhouseTeam } from './team';
import '../styles/classes.css';

/**
 * /golf/dashboard/classes in Clubhouse, for players. A class is the player's
 * own and is saved with the team whose calendar it goes on, so a player on no
 * team gets the no-team page. Coaches have no Classes page (they see a player's
 * classes on the calendar), so this route is player-only.
 */
export async function ClubhouseClassesRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.player) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team || team.role !== 'player') return <ClassesNoTeam />;
  const data = await loadClasses({ playerId: session.player.id, teamId: team.teamId });
  return <Classes data={data} playerId={session.player.id} teamId={team.teamId} />;
}
