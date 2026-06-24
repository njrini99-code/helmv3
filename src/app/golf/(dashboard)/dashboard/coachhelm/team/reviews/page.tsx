import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getPendingCoachReviews } from '@/app/golf/actions/round-reviews';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayReviewsWorkspace } from '@/components/fairway/pages/coachhelm/FairwayReviewsWorkspace';

export const metadata = {
  title: 'Round Reviews | CoachHelm',
  description: 'Post-round review queue for your team.',
};

export const dynamic = 'force-dynamic';

export default async function CoachHelmTeamReviewsPage() {
  if (!isRedesignEnabled()) {
    redirect('/golf/dashboard/rounds');
  }

  const session = await getGolfSessionProfile();
  if (!session?.coach) redirect('/golf/login');

  const [countsRes, reviewsRes] = await Promise.all([
    getAlertCounts(session.coach.id),
    getPendingCoachReviews(),
  ]);

  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  const reviews = reviewsRes.success ? reviewsRes.reviews ?? [] : [];

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayReviewsWorkspace reviews={reviews} signalCount={signalCount} />
    </div>
  );
}
