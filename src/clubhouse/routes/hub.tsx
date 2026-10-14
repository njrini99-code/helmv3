import 'server-only';
import { Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { loadTeamHub } from '../data/hub';
import { parseHubTab } from '../lib/hub-tabs';
import { TeamHub } from '../screens/hub/TeamHub';
import { EmptyState } from '../ui/States';
import { resolveClubhouseTeam } from './team';
import '../styles/hub.css';

/**
 * /golf/dashboard/team-hub in Clubhouse, for coaches and players (the
 * Fairway page is player-only). The role comes from the session and the team
 * from resolveClubhouseTeam; a player's reads are that player's own
 * (getPlayerHubSummaryData checks the pair), a coach's are the team's.
 * `task` (a notification's `?task=<id>`) scrolls that task's row into view once.
 */
export async function ClubhouseHubRoute({ tab, task }: { tab?: string; task?: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) {
    return (
      <main className="ch-hb">
        <EmptyState
          size="page"
          code="CH-10309"
          icon={Users}
          title="You aren’t on a team yet"
          body={
            pickGolfDashboardRole(session) === 'coach'
              ? 'Once your team is set up, Team Hub holds its announcements, trips, tasks and files.'
              : "Ask your coach for your team’s code or an invite. Once you join, Team Hub shows your team’s posts, trips and tasks."
          }
        />
      </main>
    );
  }
  const data = await loadTeamHub({ role: team.role, teamId: team.teamId, userId: session.userId, playerId: team.role === 'player' ? team.playerId : null });
  const viewerName =
    (team.role === 'coach' ? session.coach?.full_name : null) ??
    ([session.player?.first_name, session.player?.last_name].filter(Boolean).join(' ') || 'You');
  const focusTask = task && /^[\w-]{1,64}$/.test(task) ? task : null;
  return <TeamHub data={data} initialTab={parseHubTab(tab, team.role)} viewerName={viewerName} focusTask={focusTask} />;
}
