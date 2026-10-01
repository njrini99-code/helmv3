import { NewRound } from '../screens/rounds/entry/NewRound';

/**
 * /golf/dashboard/rounds/new in Clubhouse, for players: setup and then the round, over the new-round engine. There is
 * nothing to read on the server (the course library, the qualifiers and today's date are read by the screen, in the
 * browser, as the legacy screen does), so the route only names the player. Coaches don't log rounds: they keep the
 * legacy page's own message, and Clubhouse's shell draws its not-rebuilt page for them.
 */
export function ClubhouseNewRoundRoute({ playerId }: { playerId: string }) {
  return <NewRound playerId={playerId} />;
}
