import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadEventScope, loadLiveRounds } from '../data/live-rounds';
import { scopeFromParams, type LiveScope } from '../live/scope';
import { LiveDenied, LiveView } from '../screens/live/LiveView';
import { resolveClubhouseTeam } from './team';
import '../styles/live.css';

/**
 * /golf/dashboard/live in Clubhouse, for coaches: every player who is out right now. The team is the coach's own
 * (resolveClubhouseTeam), never one named in the address. The query narrows the list (`?event=`, `?qualifier=`,
 * `?session=`, `?player=`, `?type=`); a value that is not a plain id is dropped. A player's address opens Home (the
 * layout redirects them). Server data first: the client polls after paint.
 */
export async function ClubhouseLiveRoute({ params }: { params: Record<string, string | string[] | undefined> }) {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return null;
  const team = await resolveClubhouseTeam(session);
  // No active team for this coach: the page says it is not theirs to read (CH-16609), not an empty list.
  if (team?.role !== 'coach') return <LiveDenied />;
  let scope: LiveScope | undefined = scopeFromParams(params);
  if (scope.eventId) {
    const resolved = await loadEventScope({ teamId: team.teamId, eventId: scope.eventId });
    scope = resolved ? { ...scope, ...resolved } : { ...scope, eventId: undefined };
  }
  const snapshot = await loadLiveRounds({ teamId: team.teamId, viewer: { role: 'coach', playerId: null }, scope });
  return <LiveView initial={snapshot} scope={scope} />;
}
