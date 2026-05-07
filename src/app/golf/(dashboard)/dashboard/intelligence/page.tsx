import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { IntelligenceCommandCenter } from '@/components/golf/coachhelm/v2';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { getTeamCategoryInsights, getTeamOverview } from '@/app/golf/actions/team-category-insights';
import { TeamCategoryView, TeamCompositeCard, TeamShotOverview } from '@/components/golf/coachhelm/coach';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';

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

  // Single org→team lookup shared by IntelligenceCommandCenter,
  // getTeamOverview, and getTeamCategoryInsights. Both action calls now
  // accept a teamId argument so they skip their internal redundant lookup.
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

  // Fetch team overview and categorized insights in parallel using the
  // already-resolved teamId (no duplicate lookups).
  const [overviewResult, result] = await Promise.all([
    getTeamOverview(teamId),
    getTeamCategoryInsights(teamId),
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
        {/* Editorial hero band — magazine-cover framing for the team
            intelligence layer beneath the sticky LargeTitleHeader. The
            surface-stone plinth gives the editorial copy a sculpted-
            matte foundation (linen→cream gradient + warm natural-light
            shadow) so it reads as architectural, not floating. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-8">
            <PageHeader
              eyebrow="Coach Intelligence"
              eyebrowAccent="primary"
              title="Your team this week."
              subtitle="Composite ratings, category signals, and the patterns moving scores right now."
            />
          </div>
        </Reveal>

        {/* Team Overview Section */}
        {overviewResult.success && overviewResult.data && (
          <Reveal staggerIndex={1} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <TeamCompositeCard
              composite={overviewResult.data.teamComposite}
              categories={overviewResult.data.teamCategories}
              playerCount={overviewResult.data.playerCount}
              statsRowCount={overviewResult.data.statsRowCount}
            />
            <TeamShotOverview
              yardageCurve={overviewResult.data.teamShotAnalysis.yardageCurve}
              deadZones={overviewResult.data.teamShotAnalysis.deadZones}
              topWeaknesses={overviewResult.data.teamShotAnalysis.topWeaknesses}
            />
          </Reveal>
        )}

        <Reveal staggerIndex={2}>
          {result.success && result.data ? (
            <TeamCategoryView
              categories={result.data.categories}
              teamHealth={result.data.teamHealth}
              lastAnalyzed={result.data.lastAnalyzed}
            />
          ) : (
            <div className="surface-matte rounded-3xl p-8 text-center">
              <p className="text-warm-500">
                {result.error || 'Unable to load team intelligence. Make sure your team has players with round data.'}
              </p>
            </div>
          )}
        </Reveal>

        {/* Deep Analysis (uses existing IntelligenceCommandCenter).
            No Suspense wrapper — IntelligenceCommandCenter is a 'use client'
            component with its own internal loading states. The old Suspense
            fallback never fired because there was nothing async above it
            to suspend. */}
        <Reveal staggerIndex={3} className="mt-8">
          <IntelligenceCommandCenter
            teamId={teamId}
            coachId={coach.id}
            variant="widget"
          />
        </Reveal>
      </div>
    </div>
  );
}
