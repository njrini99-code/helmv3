import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { CoachHelmAnalyticsDashboard } from '@/components/golf/coachhelm/analytics/CoachHelmAnalyticsDashboard';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
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
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard');

  const supabase = await createClient();

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
      <div className="min-h-full">
        <LargeTitleHeader
          title="CoachHelm Analytics"
          subtitle="Track insight effectiveness and prediction accuracy"
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/golf/dashboard' },
                { label: 'Analytics', href: '/golf/dashboard/analytics/coachhelm' },
                { label: 'CoachHelm' },
              ]}
            />
          }
        />
        <div className="flex items-center justify-center p-6">
          <div className="text-center">
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h2>
            <p className="text-warm-600">
              You need to be associated with a team to view analytics.
            </p>
          </div>
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
