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

  return (
    <Suspense fallback={<PageLoading />}>
      <CoachHelmIntelligenceDashboard
        teamId={teamId}
        coachId={coach.id}
        initialInsights={initialData.insights}
        initialPlayerSummaries={initialData.playerSummaries}
        initialCorrelations={initialData.correlations}
      />
    </Suspense>
  );
}
