import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { IntelligenceCommandCenter } from '@/components/golf/coachhelm/v2';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { getTeamCategoryInsights, getTeamOverview } from '@/app/golf/actions/team-category-insights';
import { TeamCategoryView, TeamCompositeCard, TeamShotOverview } from '@/components/golf/coachhelm/coach';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Intelligence Dashboard | CoachHelm',
  description: 'AI-powered insights, patterns, predictions, and coaching intelligence for your team',
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function IntelligenceDashboardPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  if (!coach) {
    if (player) redirect('/golf/dashboard/coachhelm');
    redirect('/golf/login');
  }

  const supabase = await createClient();

  // Look up team_id via organization_id. This lookup is used by
  // IntelligenceCommandCenter below. getTeamOverview and
  // getTeamCategoryInsights currently perform their own internal team
  // lookup (they share the same session), so there is some duplicate work
  // at the DB. Those action signatures are owned by a neighbouring module
  // (team-category-insights.ts) and are tracked for follow-up — once they
  // accept an explicit teamId, pass `teamId` here and they'll become
  // single-lookup calls.
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = team?.id ?? null;
  }

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // Fetch team overview and categorized insights in parallel.
  const [overviewResult, result] = await Promise.all([
    getTeamOverview(),
    getTeamCategoryInsights(),
  ]);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <LargeTitleHeader
        title="CoachHelm AI"
        subtitle="Team intelligence by category"
      />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 w-full">
        {/* Team Overview Section */}
        {overviewResult.success && overviewResult.data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <TeamCompositeCard
              composite={overviewResult.data.teamComposite}
              categories={overviewResult.data.teamCategories}
              playerCount={overviewResult.data.playerCount}
            />
            <TeamShotOverview
              yardageCurve={overviewResult.data.teamShotAnalysis.yardageCurve}
              deadZones={overviewResult.data.teamShotAnalysis.deadZones}
              topWeaknesses={overviewResult.data.teamShotAnalysis.topWeaknesses}
            />
          </div>
        )}

        {result.success && result.data ? (
          <TeamCategoryView
            categories={result.data.categories}
            teamHealth={result.data.teamHealth}
            lastAnalyzed={result.data.lastAnalyzed}
          />
        ) : (
          <div className="glass-premium rounded-2xl p-8 text-center">
            <p className="text-warm-500">
              {result.error || 'Unable to load team intelligence. Make sure your team has players with round data.'}
            </p>
          </div>
        )}

        {/* Deep Analysis (uses existing IntelligenceCommandCenter).
            No Suspense wrapper — IntelligenceCommandCenter is a 'use client'
            component with its own internal loading states. The old Suspense
            fallback never fired because there was nothing async above it
            to suspend. */}
        <div className="mt-8">
          <IntelligenceCommandCenter
            teamId={teamId}
            coachId={coach.id}
            variant="widget"
          />
        </div>
      </div>
    </div>
  );
}
