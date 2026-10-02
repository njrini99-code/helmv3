import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoundsLibrary } from '../data/rounds';
import { chLogServer } from '../lib/track-server';
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
  // The team only sets the time zone for "today", so a failed membership read costs that, not the page: the rounds are the player's own.
  // It is read beside the rounds, not before them (the library awaits it only for the clock).
  const teamId = resolveClubhouseTeam(session).then(
    (team) => team?.teamId ?? null,
    (err: unknown) => {
      chLogServer('rounds', 'team', err);
      return null;
    },
  );
  const data = await loadRoundsLibrary({ playerId: session.player.id, teamId });
  return <RoundsLibrary data={data} playerId={session.player.id} />;
}
