import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoundsLibrary } from '../data/rounds';
import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import { resolveClubhouseTeam } from './team';
import '../styles/rounds.css';

/**
 * /golf/dashboard/rounds in Clubhouse, for players. A player's rounds are
 * their own, with or without a team; the team only sets the time zone that
 * decides what "today" is. Coaches have no Rounds library in v2 (they reach a
 * round from Stats, Home and Qualifiers), so this route is player-only.
 */
export async function ClubhouseRoundsRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.player) return null;
  const team = await resolveClubhouseTeam(session);
  const data = await loadRoundsLibrary({ playerId: session.player.id, teamId: team?.teamId ?? null });
  return <RoundsLibrary data={data} playerId={session.player.id} />;
}
