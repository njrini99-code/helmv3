import 'server-only';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { canHideGolfConversations } from '@/app/golf/actions/conversation-hide';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { loadMessagesDirectory } from '../data/messages';
import { Messages } from '../screens/messages/Messages';
import { toChAnnouncement } from '../screens/messages/model';
import { MessagesNoTeam } from '../screens/messages/MessagesNoTeam';
import { chLogServer } from '../lib/track-server';
import { resolveClubhouseTeam } from './team';
import '../styles/messages.css';

/**
 * /golf/dashboard/messages in Clubhouse, for coaches and players. The thread
 * list and messages stay on the live realtime hooks; the server loads who the
 * viewer may message, the team's timezone, the announcements over the list and
 * whether a conversation can be deleted, together, so the inbox doesn't queue
 * them as server actions after it lands.
 */
export async function ClubhouseMessagesRoute() {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return <MessagesNoTeam coach={pickGolfDashboardRole(session) === 'coach'} />;
  }
  const viewerName = session.coach?.full_name ?? ([session.player?.first_name, session.player?.last_name].filter(Boolean).join(' ') || 'You');
  const viewerPlayerId = team.role === 'player' ? team.playerId : null;
  const [data, canHide, anns] = await Promise.all([
    loadMessagesDirectory({ role: team.role, teamId: team.teamId, viewerUserId: session.userId, viewerName, viewerPlayerId }),
    // Failed, it is left out and the inbox asks for it itself once it lands (Messages), rather than hiding Delete.
    canHideGolfConversations().catch((err: unknown) => {
      chLogServer('messages', 'canHide', err, 'messaging');
      return undefined;
    }),
    getAnnouncementsWithMeta(team.teamId, session.userId, team.role === 'coach', viewerPlayerId).catch((err: unknown) => {
      chLogServer('messages', 'announcements', err, 'messaging');
      return null;
    }),
  ]);
  const announcements = anns?.success && anns.data ? anns.data.map(toChAnnouncement) : null;
  return <Messages data={{ ...data, ...(canHide === undefined ? {} : { canHide }), announcements }} />;
}
