import 'server-only';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { isUuid } from '@/lib/utils/uuid';
import { loadCourseHistory, type ChCourseViewer } from '../data/course-history';
import { courseHref } from '../data/course-key';
import { CoursePage } from '../screens/rounds/CoursePage';
import { CourseLoadFailed } from '../screens/rounds/CourseLoadFailed';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { resolveClubhouseTeam } from './team';
import '../styles/rounds.css';

/**
 * /golf/dashboard/rounds/course/[key] in Clubhouse (P-7): a player's history at one course. The player reads their own;
 * a coach reads one player of their team (`?player=`). Not one of this viewer's courses reads "No rounds here", and a
 * coach's player not on the team "This player isn't on your team".
 */
export async function ClubhouseCourseHistoryRoute({ rawKey, player, hole, window }: { rawKey: string; player: string | null; hole: string | null; window: 'all' | 'season' }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  let viewer: ChCourseViewer | null = null;
  if (team?.role === 'coach') viewer = player && isUuid(player as unknown) ? { role: 'coach', teamId: team.teamId, playerId: player } : null;
  else if (team?.role === 'player') viewer = { role: 'player', playerId: team.playerId };
  else if (session.player && pickGolfDashboardRole(session) === 'player') viewer = { role: 'player', playerId: session.player.id };

  const coach = team?.role === 'coach';
  const result = viewer ? await loadCourseHistory(rawKey, viewer, { window }) : coach ? ({ kind: 'notOnTeam' } as const) : ({ kind: 'notFound' } as const);
  if (result.kind === 'redirect') redirect(courseHref(result.to, { player: coach && player ? player : undefined, window: window === 'season' ? 'season' : undefined }));
  if (result.kind === 'error') return <CourseLoadFailed />;
  if (result.kind === 'notFound' || result.kind === 'notOnTeam') {
    const off = result.kind === 'notOnTeam';
    return (
      <main className="ch-ch" aria-labelledby="ch-ch-nf">
        <EmptyState
          size="page"
          code={off ? 'CH-11331' : 'CH-11330'}
          icon={Flag}
          title={off ? 'This player isn’t on your team' : 'No rounds here'}
          body={off ? 'Their history at this course isn’t yours to see.' : 'There are no rounds at this course to show.'}
          action={
            <Button variant="primary" href={coach ? '/golf/dashboard/stats' : '/golf/dashboard/rounds'}>
              {coach ? 'Go to Stats' : 'Go to your rounds'}
            </Button>
          }
        />
        <span id="ch-ch-nf" className="ch-sr-only">
          Course history not found
        </span>
      </main>
    );
  }
  const holeN = hole ? Number(hole) : NaN;
  return <CoursePage history={result.data} playerName={result.playerName} playerId={coach ? (player ?? null) : null} initialHole={Number.isInteger(holeN) && holeN >= 1 && holeN <= 18 ? holeN : null} />;
}
