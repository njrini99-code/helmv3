import Link from 'next/link';
import { Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import {
  getCoachHelmOverview,
  getInsightEffectiveness,
  getPredictionPerformance,
  getPatternImpact,
} from '@/app/golf/actions/coachhelm-analytics';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayEffectiveness, InlineNotice, EmptyState, Button } from '@/components/fairway';
import { EffectivenessRetryButton } from './EffectivenessRetryButton';
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
    // A Fairway-styled "feature unavailable" state — same copy/behavior the
    // legacy `FeatureUnavailable` component used to render here (Wave W1:
    // Fairway is the only tree, so the no-team state gets the Fairway skin
    // instead of legacy chrome).
    return (
      <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas')}>
        <EmptyState
          icon={<Lock />}
          title="CoachHelm Effectiveness"
          description="You need to be associated with a team to view effectiveness analytics. Create or join a team to start tracking insight and prediction accuracy."
          action={
            <Button asChild variant="primary">
              <Link href="/golf/dashboard/team">Go to Team Settings</Link>
            </Button>
          }
        />
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
        <InlineNotice
          tone="danger"
          title="Couldn’t load effectiveness analytics"
          action={<EffectivenessRetryButton />}
        >
          {loaderError}. Try again — if this keeps happening, the analytics
          service may be temporarily unavailable.
        </InlineNotice>
      </div>
    );
  }

  // The warm "Effectiveness" surface (CoachHelmShell active='effectiveness',
  // defaultParams: predictions tab / 30d). The four SSR Promise.all results
  // are passed UNCHANGED; the surface re-fetches on range change via the SAME
  // four loaders. Honest InsufficientData for starved figures (never an
  // authoritative 0%).
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
