import 'server-only';
import { redirect } from 'next/navigation';
import { Flag } from 'lucide-react';
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
  const team = await resolveClubhouseTeam(session);
  const viewer: ChReviewViewer | null = session.player && !session.coach ? { role: 'player', playerId: session.player.id } : team?.role === 'coach' ? { role: 'coach', teamId: team.teamId } : null;
  const result = viewer ? await loadRoundReview(id, viewer) : ({ kind: 'notFound' } as const);

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
          title="This round isn't here"
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
  return <RoundReview review={result.review} />;
}
