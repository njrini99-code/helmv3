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
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayEffectiveness, InlineNotice } from '@/components/fairway';
import { FeatureUnavailable } from '@/components/golf/layout/FeatureUnavailable';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';

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

  // Get team ID from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    // No-team branch ALSO forks: the redesign shows the canonical
    // FeatureUnavailable, legacy keeps its bespoke "No Team Found" card.
    if (isRedesignEnabled()) {
      return (
        <FeatureUnavailable
          title="CoachHelm Effectiveness"
          message="You need to be associated with a team to view effectiveness analytics. Create or join a team to start tracking insight and prediction accuracy."
          actionHref="/golf/dashboard/team"
          actionLabel="Go to Team Settings"
        />
      );
    }
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

  // ── Loader failure surfacing (ADDITIVE) ────────────────────────────────────
  // A failed server query returns { success: false, error } (a genuinely empty
  // result still returns success:true with zeroed aggregates). Previously we
  // unwrapped `.data` unconditionally, so a failed query rendered an empty panel
  // as if it were "no data yet". Detect any failed loader and render an honest
  // error state instead of masking the failure.
  const loaderError =
    (!overviewResult.success && overviewResult.error) ||
    (!effectivenessResult.success && effectivenessResult.error) ||
    (!performanceResult.success && performanceResult.error) ||
    (!patternResult.success && patternResult.error) ||
    null;

  if (loaderError) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient p-6 font-fw-sans text-text-primary')}>
        <InlineNotice tone="danger" title="Couldn’t load effectiveness analytics">
          {loaderError}. Refresh the page to try again — if this keeps happening, the
          analytics service may be temporarily unavailable.
        </InlineNotice>
      </div>
    );
  }

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the warm "Effectiveness" surface (CoachHelmShell active=
  // 'effectiveness', defaultParams: predictions tab / 30d). The four SSR
  // Promise.all results are passed UNCHANGED; the surface re-fetches on range
  // change via the SAME four loaders. Honest InsufficientData for starved figures
  // (never an authoritative 0%). Flag OFF → CoachHelmAnalyticsDashboard verbatim.
  if (isRedesignEnabled()) {
    const countsRes = await getAlertCounts(coach.id);
    const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayEffectiveness
          teamId={teamId}
          coachId={coach.id}
          initialOverview={overviewResult.data}
          initialEffectiveness={effectivenessResult.data}
          initialPerformance={performanceResult.data}
          initialPatternImpact={patternResult.data}
          signalCount={signalCount}
          initialView="cockpit"
          initialRange="30d"
        />
      </div>
    );
  }

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
