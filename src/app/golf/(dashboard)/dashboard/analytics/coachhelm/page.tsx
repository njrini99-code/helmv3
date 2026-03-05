import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CoachHelmAnalyticsDashboard } from '@/components/golf/coachhelm/analytics/CoachHelmAnalyticsDashboard';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import {
  getCoachHelmOverview,
  getInsightEffectiveness,
  getPredictionPerformance,
  getPatternImpact,
} from '@/app/golf/actions/coachhelm-analytics';

export const metadata = {
  title: 'CoachHelm Analytics | GolfHelm',
  description: 'Track the effectiveness of AI insights and prediction accuracy',
};

export default async function CoachHelmAnalyticsPage() {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Get coach record
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!coach) {
    redirect('/golf/dashboard');
  }

  // Get team ID from organization
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
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-warm-900 mb-2">No Team Found</h2>
          <p className="text-warm-600">
            You need to be associated with a team to view analytics.
          </p>
        </div>
      </div>
    );
  }

  // Fetch all analytics data in parallel
  const [overviewResult, effectivenessResult, performanceResult, patternResult] = await Promise.all([
    getCoachHelmOverview(teamId),
    getInsightEffectiveness(teamId),
    getPredictionPerformance(teamId),
    getPatternImpact(teamId),
  ]);

  return (
    <AnimatedPage>
      <AnimatedItem>
        <CoachHelmAnalyticsDashboard
          teamId={teamId}
          coachId={coach.id}
          initialOverview={overviewResult.data}
          initialEffectiveness={effectivenessResult.data}
          initialPerformance={performanceResult.data}
          initialPatternImpact={patternResult.data}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}
