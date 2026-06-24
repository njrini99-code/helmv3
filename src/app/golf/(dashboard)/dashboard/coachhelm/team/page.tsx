import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getTeamCategoryInsights, getTeamOverview } from '@/app/golf/actions/team-category-insights';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayBrief } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

export const metadata = {
  title: 'Team Brief | CoachHelm',
  description: 'What to work on first — your morning coaching directive.',
};

export const dynamic = 'force-dynamic';

/** Canonical CoachHelm team brief — `/golf/dashboard/coachhelm/team`. */
export default async function CoachHelmTeamBriefPage() {
  if (!isRedesignEnabled()) {
    redirect('/golf/dashboard/intelligence');
  }

  const session = await getGolfSessionProfile();
  if (!session?.coach) redirect('/golf/login');

  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(
    supabase,
    session.coach.organization_id,
    session.coach.id,
  );
  if (!teamId) redirect('/golf/dashboard');

  const [overviewResult, categoryResult, countsRes] = await Promise.all([
    getTeamOverview(teamId),
    getTeamCategoryInsights(teamId),
    getAlertCounts(session.coach.id),
  ]);

  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayBrief
        overview={overviewResult}
        categoryInsights={categoryResult}
        teamId={teamId}
        coachId={session.coach.id}
        signalCount={signalCount}
      />
    </div>
  );
}
