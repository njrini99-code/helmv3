import 'server-only';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRoundReview, type ChReviewViewer } from '../data/round-review';
import { RoundReview } from '../screens/rounds/RoundReview';
import { ReviewLoadFailed } from '../screens/rounds/ReviewLoadFailed';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { resolveClubhouseTeam } from './team';
import '../styles/rounds.css';

/**
 * /golf/dashboard/rounds/[id] in Clubhouse: one round's review, for the
 * player who played it or a coach of their team. A round still being played
 * goes to be continued, as on the legacy page. Anyone else, and a round that
 * doesn't exist, get the same "not here" page, so the page never confirms
 * that someone else's round exists.
 */
export async function ClubhouseRoundReviewRoute({ id }: { id: string }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  // The round is read while the team resolves (the team only says who is looking, not which round), so the review pays one read, not two in a row.
  // Who is looking follows the resolved dashboard role, not "has no coach row" (RR-1, as Roster since 2026-10-17): a user with
  // a coach row and a player row, acting as the player, reads their own round, not "This round isn't here".
  const viewerRead = resolveClubhouseTeam(session).then((team): ChReviewViewer | null => {
    if (team?.role === 'coach') return { role: 'coach', teamId: team.teamId };
    if (team?.role === 'player') return { role: 'player', playerId: team.playerId, teamId: team.teamId };
    // A player not on a team yet still has their own rounds.
    return session.player && pickGolfDashboardRole(session) === 'player' ? { role: 'player', playerId: session.player.id, teamId: null } : null;
  });
  const [viewer, result] = await Promise.all([viewerRead, loadRoundReview(id, viewerRead)]);

  if (result.kind === 'inProgress') redirect(`/golf/dashboard/rounds/continue/${id}`);
  if (result.kind === 'error') return <ReviewLoadFailed />;
  if (result.kind === 'notFound') {
    const coach = viewer?.role === 'coach';
    return (
      <main className="ch-rv" aria-labelledby="ch-rv-nf">
        <EmptyState
          size="page"
          code="CH-11307"
          icon={Flag}
          title="This round isn’t here"
          body={coach ? 'It may have been deleted, or it was played by someone who isn’t on your team.' : 'It may have been deleted, or it isn’t one of your rounds.'}
          action={
            <Button variant="primary" href={coach ? '/golf/dashboard/stats' : '/golf/dashboard/rounds'}>
              {coach ? 'Go to Stats' : 'Go to your rounds'}
            </Button>
          }
        />
        <span id="ch-rv-nf" className="ch-sr-only">
          Round not found
        </span>
      </main>
    );
  }
  return <RoundReview review={result.review} typeEdit={result.typeEdit} />;
}
