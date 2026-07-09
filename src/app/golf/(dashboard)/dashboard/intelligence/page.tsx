import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getTeamCategoryInsights, getTeamOverview } from '@/app/golf/actions/team-category-insights';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayBrief, FeatureUnavailable } from '@/components/fairway';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Intelligence Dashboard | CoachHelm',
  description: 'AI-powered insights, patterns, predictions, and coaching intelligence for your team',
};

// The coach Brief reflects team data that PLAYERS change (logging rounds). Force
// dynamic so the route is always freshly rendered and never served from a stale
// Full Route Cache entry; the FairwayBrief focus/visibility refresh handles the
// client Router Cache on soft navigations.
export const dynamic = 'force-dynamic';

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function IntelligenceDashboardPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) {
      return (
        <FeatureUnavailable
          title="Intelligence Hub"
          message="The Intelligence Hub aggregates team-wide signals for coaches. Your personal AI coaching surface lives on the CoachHelm dashboard."
          actionHref="/golf/dashboard/coachhelm"
          actionLabel="Open CoachHelm"
        />
      );
    }
    redirect('/golf/login');
  }

  const supabase = await createClient();

  // Single org→team lookup shared by IntelligenceCommandCenter,
  // getTeamOverview, and getTeamCategoryInsights. Both action calls now
  // accept a teamId argument so they skip their internal redundant lookup.
  // Deterministic resolution: handles orgs with >1 team.
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // Fetch team overview and categorized insights in parallel using the
  // already-resolved teamId (no duplicate lookups).
  const [overviewResult, result] = await Promise.all([
    getTeamOverview(teamId),
    getTeamCategoryInsights(teamId),
  ]);

  // The warm Fairway "Brief" surface inside the .fairway-ds scope on
  // bg-canvas. It renders the CoachHelmShell wrapper itself; the route only
  // feeds it the already-fetched data + the shared unread-signal count.
  const countsRes = await getAlertCounts(coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayBrief
        overview={overviewResult}
        categoryInsights={result}
        teamId={teamId}
        coachId={coach.id}
        signalCount={signalCount}
      />
    </div>
  );
}
