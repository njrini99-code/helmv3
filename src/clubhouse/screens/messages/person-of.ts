import type { ChPerson } from './model';
import type { ChMessagesApi } from './MessagesView';

/**
 * The person for a user id: the team directory first, then the open group's own members. The directory holds the
 * viewer's current team only, so someone in an older team's chat (a player who moved teams, a former teammate) is
 * named from the conversation's participant identities, the same names Details lists, instead of "Member".
 */
export const personOf = (api: Pick<ChMessagesApi, 'directory' | 'members'>, userId: string): ChPerson | undefined => {
  const known = api.directory.find((p) => p.userId === userId);
  if (known) return known;
  const member = api.members?.find((m) => m.userId === userId);
  if (!member) return undefined;
  return { userId, name: member.name, role: member.role === 'coach' ? 'coach' : 'player', subtitle: member.subtitle, gradYear: null, playerId: null };
};
