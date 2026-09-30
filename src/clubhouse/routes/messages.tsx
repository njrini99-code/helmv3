import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadMessagesDirectory } from '../data/messages';
import { Messages } from '../screens/messages/Messages';
import { MessagesNoTeam } from '../screens/messages/MessagesNoTeam';
import { resolveClubhouseTeam } from './team';
import '../styles/messages.css';

/**
 * /golf/dashboard/messages in Clubhouse, for coaches and players. The thread
 * list and messages stay on the live realtime hooks; the server loads who the
 * viewer may message and the team's timezone.
 */
export async function ClubhouseMessagesRoute() {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return <MessagesNoTeam />;
  }
  const viewerName = session.coach?.full_name ?? ([session.player?.first_name, session.player?.last_name].filter(Boolean).join(' ') || 'You');
  const data = await loadMessagesDirectory({ role: team.role, teamId: team.teamId, viewerUserId: session.userId, viewerName, viewerPlayerId: team.role === 'player' ? team.playerId : null });
  return <Messages data={data} />;
}
