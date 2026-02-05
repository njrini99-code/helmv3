import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageLoading } from '@/components/ui/loading';
import { CoachHelmIntelligenceDashboard } from '@/components/golf/coachhelm/CoachHelmIntelligenceDashboard';
import { getTeamInsightsSummary, type IntelligenceDashboardData } from '@/app/golf/actions/intelligence-dashboard';

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Intelligence Dashboard | CoachHelm',
  description: 'AI-powered insights, trends, and pattern analysis for your team',
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function IntelligenceDashboardPage() {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Get coach record - golf_coaches doesn't have team_id, we look it up via organization_id
  const { data: coachData } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const coach = coachData as { id: string; organization_id: string | null } | null;

  if (!coach) {
    // Check if player
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (player) {
      // Redirect players to their CoachHelm dashboard
      redirect('/golf/dashboard/coachhelm');
    }

    redirect('/golf/login');
  }

  // Look up team_id via organization_id (golf_coaches doesn't have team_id directly)
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

  // Fetch initial dashboard data
  let initialData: IntelligenceDashboardData = {
    insights: [],
    playerSummaries: [],
    correlations: [],
  };

  try {
    const summaryResult = await getTeamInsightsSummary(teamId);
    if (summaryResult.success && summaryResult.data) {
      initialData = summaryResult.data;
    }
  } catch (error) {
    console.error('Failed to fetch intelligence dashboard data:', error);
  }

  // Calculate insight priority summary
  const insightPrioritySummary = (() => {
    const insights = initialData.insights || [];
    const urgent = insights.filter(i => i.priority === 'urgent' || i.priority === 'high').length;
    const medium = insights.filter(i => i.priority === 'medium').length;
    const low = insights.filter(i => i.priority === 'low').length;
    const playersWithInsights = initialData.playerSummaries?.length || 0;
    const correlations = initialData.correlations?.length || 0;
    return { total: insights.length, urgent, medium, low, playersWithInsights, correlations };
  })();

  return (
    <div className="flex flex-col min-h-full">
      {/* Priority Summary Banner */}
      {insightPrioritySummary.total > 0 && (
        <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-1">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="font-medium text-slate-700">
              {insightPrioritySummary.total} insight{insightPrioritySummary.total !== 1 ? 's' : ''} found
            </span>
            {insightPrioritySummary.urgent > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {insightPrioritySummary.urgent} urgent
              </span>
            )}
            {insightPrioritySummary.medium > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                {insightPrioritySummary.medium} medium
              </span>
            )}
            {insightPrioritySummary.low > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                {insightPrioritySummary.low} low
              </span>
            )}
            {insightPrioritySummary.correlations > 0 && (
              <span className="text-slate-500 text-xs">
                {insightPrioritySummary.correlations} pattern{insightPrioritySummary.correlations !== 1 ? 's' : ''} detected
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex-1">
        <Suspense fallback={<PageLoading />}>
          <CoachHelmIntelligenceDashboard
            teamId={teamId}
            coachId={coach.id}
            initialInsights={initialData.insights}
            initialPlayerSummaries={initialData.playerSummaries}
            initialCorrelations={initialData.correlations}
          />
        </Suspense>
      </div>
    </div>
  );
}
