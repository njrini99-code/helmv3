import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadLiveRounds } from '../data/live-rounds';
import { loadTeamRounds } from '../data/team-rounds';
import { TeamRounds } from '../screens/rounds/TeamRounds';
import { resolveClubhouseTeam } from './team';
import { NoTeam } from '../ui/NoTeam';
import '../styles/rounds.css';

/**
 * /golf/dashboard/rounds in Clubhouse, for coaches: every round the team has posted. The team is the coach's own
 * (resolveClubhouseTeam), never one named in the address. A player's Rounds is routes/rounds.tsx.
 */
export async function ClubhouseTeamRoundsRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return null;
  const team = await resolveClubhouseTeam(session);
  if (team?.role !== 'coach') {
    return (
      <main className="ch-rd">
        <NoTeam code="CH-11318" coach body="The rounds your players post show up here once your team is set up." />
      </main>
    );
  }
  // The live band is read beside the book, never ahead of it; a failed live read is an empty snapshot, which draws no band.
  const [data, live] = await Promise.all([loadTeamRounds({ teamId: team.teamId }), loadLiveRounds({ teamId: team.teamId, viewer: { role: 'coach', playerId: null } })]);
  return <TeamRounds data={data} teamId={team.teamId} live={live} />;
}
