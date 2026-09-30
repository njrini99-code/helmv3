import 'server-only';
import { Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadCoachCoachHelm, loadPlayerCoachHelm } from '../data/coachhelm';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { EmptyState } from '../ui/States';
import { NotRebuilt } from '../shell/NotRebuilt';
import { resolveClubhouseTeam } from './team';
import '../styles/coachhelm.css';

/**
 * /golf/dashboard/coachhelm in Clubhouse, for coaches and players (the Fairway
 * page is the player's only). The role comes from the session. A coach reads
 * their team's players, whichever other teams they staff; a player reads only
 * their own insights, with or without a team, and is never handed a coach control.
 */
/**
 * The Fairway page's `?view=` drills, which the old /my-development, /my-game-profile and /my-standing addresses
 * (and focus-area cards) redirect to, and the player nav's Deep dive. The Clubhouse board is not those views, so a link to one says it isn't rebuilt
 * yet rather than landing on the board as if it were (Q-76). `?view=insights` is the board.
 */
const VIEWS_NOT_REBUILT: Record<string, string> = { development: 'Development', profile: 'Game profile', standing: 'Standing', 'deep-dive': 'Deep dive' };

/** `?player=<golf_players.id>` opens a coach's board on that player (Roster's View insights); an id not on the board is ignored. */
export async function ClubhouseCoachHelmRoute({ view, player }: { view?: string; player?: string } = {}) {
  const notYet = view ? VIEWS_NOT_REBUILT[view] : undefined;
  if (notYet) return <NotRebuilt label={notYet} />;
  const session = await getGolfSessionProfile();
  if (!session) return null;
  if (session.coach) {
    const team = await resolveClubhouseTeam(session);
    if (!team || team.role !== 'coach') {
      return (
        <main className="ch-hl">
          <EmptyState
            size="page"
            code="CH-13308"
            icon={Users}
            title="You aren't on a team yet"
            body="Once your team is set up, CoachHelm reads the rounds your players post and shows their signals here."
          />
        </main>
      );
    }
    const data = await loadCoachCoachHelm({ coachId: team.coachId, teamId: team.teamId });
    return <CoachBoard data={data} initialPlayer={player} />;
  }
  if (session.player) {
    const data = await loadPlayerCoachHelm({ playerId: session.player.id });
    return <PlayerBoard data={data} />;
  }
  return null;
}
