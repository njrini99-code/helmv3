import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getRecruits } from '@/app/golf/actions/recruiting';
import { fairwayScope } from '@/lib/redesign/flag';
import { Button, EmptyState } from '@/components/fairway';
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

  // A coach with no resolvable team (removed from staff, team deleted — the
  // dashboard layout only gates on onboarding_completed, not team existence)
  // gets the same dedicated "No Team Assigned" empty state as the Roster page
  // (roster/page.tsx:152-169) rather than the generic loadError "display
  // hiccup" + Retry path, which can never succeed for this coach.
  if (!result.success && result.errorCode === 'no_team') {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <div className="mx-auto flex min-h-full w-full max-w-md items-center justify-center px-4 py-16">
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title="No Team Assigned"
            description="You haven't created or joined a team yet. Create a team to start tracking recruits."
            action={
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/team">Go to Team Settings</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

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
