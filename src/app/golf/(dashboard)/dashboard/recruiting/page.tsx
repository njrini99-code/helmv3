import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getRecruits } from '@/app/golf/actions/recruiting';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayRecruitingPage } from '@/components/fairway/pages/recruiting';

export const metadata: Metadata = {
  title: 'Recruiting HQ | Helm Golf',
  description: 'Track prospects from watchlist to commitment.',
};

// Recruiting HQ scopes to the coach's ACTIVE team (getRecruits → resolveCoachAndTeam
// → resolveCoachTeamIdWithCookie reads the golf_active_team cookie). Render per
// request so a program head's team toggle is honored — a static 60s cache would
// pin the watchlist to one team.
export const dynamic = 'force-dynamic';

export default async function RecruitingPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (session.role !== 'coach' || !session.coach) {
    // Players don't get to see the prospect list; bounce them to their hub.
    redirect('/golf/dashboard');
  }

  const result = await getRecruits();
  const initialRecruits = result.success && result.data ? result.data : [];
  const loadError = result.success ? null : (result.error ?? 'Could not load recruits');

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRecruitingPage
        initialRecruits={initialRecruits}
        loadError={loadError}
      />
    </div>
  );
}
