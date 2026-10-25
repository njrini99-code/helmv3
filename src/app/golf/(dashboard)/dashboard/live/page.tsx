import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { FeatureUnavailable } from '@/components/fairway';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseLiveRoute } from '@/clubhouse/routes/live';

export const metadata = {
  title: 'Live',
  description: 'The players who are on the course right now, hole by hole',
};

// Live rounds change while the page is open; never serve a cached list.
export const dynamic = 'force-dynamic';

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  // Live rounds are a coach's page, in Clubhouse only. Every other case renders in place, never a redirect out of a
  // role-conditional branch (the React #310 guard).
  if (!session.coach || !(await isClubhouseFor('coach'))) {
    return (
      <FeatureUnavailable
        title="Live"
        message={session.coach ? 'Live rounds are part of the new GolfHelm. Your dashboard shows rounds as players post them.' : 'Live rounds are a coach feature. Your round shows on Home while you play.'}
        actionHref="/golf/dashboard"
        actionLabel="Back to Dashboard"
      />
    );
  }
  return <ClubhouseLiveRoute params={await searchParams} />;
}
