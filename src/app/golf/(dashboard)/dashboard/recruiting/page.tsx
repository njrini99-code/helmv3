import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseRecruitingRoute } from '@/clubhouse/routes/recruiting';

export const metadata: Metadata = {
  title: 'Recruiting HQ',
  description: 'Track prospects from watchlist to commitment.',
};

// Recruiting HQ scopes to the coach's ACTIVE team (the golf_active_team cookie). Render per request so a program
// head's team toggle is honored; a static 60s cache would pin the watchlist to one team.
export const dynamic = 'force-dynamic';

export default async function RecruitingPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (session.role !== 'coach' || !session.coach) {
    // Players don't get to see the prospect list; bounce them to their hub.
    redirect('/golf/dashboard');
  }

  // Coaches only. RLS on golf_recruits and golf_recruit_documents is the lock behind the redirect above. The page follows
  // the dashboard layout's role (getGolfDashboardRole): a coach row beside an onboarded player profile is drawn as a
  // player, and the Clubhouse frame shows them its coach-only state instead of this segment.
  if ((await getGolfDashboardRole()) === 'coach') return <ClubhouseRecruitingRoute />;
  return null;
}
