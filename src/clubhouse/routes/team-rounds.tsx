import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
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
  return <TeamRounds data={await loadTeamRounds({ teamId: team.teamId })} teamId={team.teamId} />;
}
