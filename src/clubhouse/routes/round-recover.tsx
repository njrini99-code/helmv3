import { RoundRecover } from '../screens/rounds/recover/RoundRecover';
import '../styles/rounds-recover.css';

/**
 * /golf/dashboard/rounds/recover in Clubhouse, for players: the rounds this device holds that the server may not,
 * with Restore, Retry sync and Discard (swap audit F-02). There is nothing to read on the server: the device is the
 * data source, as on Fairway's page, so the route only names the player. A coach has no rounds to recover (a coach
 * does not log rounds): the page keeps its own message for a session with no player, and Clubhouse's shell draws its
 * not-rebuilt page for a coach.
 */
export function ClubhouseRoundRecoverRoute({ playerId }: { playerId: string }) {
  return <RoundRecover playerId={playerId} />;
}
