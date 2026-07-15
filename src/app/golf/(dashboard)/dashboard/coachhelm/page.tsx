import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getPlayerCoachHelmDashboard } from '@/app/golf/actions/insights';
import { getPlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import {
  getTopInsightForPlayer,
  getInsightsForPlayer,
  getThemesForPlayer,
} from '@/app/golf/actions/insight-delivery';
import type { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerCoachHelm, InlineNotice, Button } from '@/components/fairway';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

export const metadata: Metadata = {
  title: 'CoachHelm | GolfHelm',
  description: 'AI-powered insights, predictions, and focus areas for your golf performance.',
};

/**
 * Error state component for displaying errors gracefully
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="danger"
          title="Unable to Load AI Dashboard"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard/coachhelm">Try Again</Link>
            </Button>
          }
        >
          {error}
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * Not a player error state - shown when user is a coach or has no player profile
 */
function NotPlayerState() {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="info"
          title="Player Dashboard Only"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard">Go to Dashboard</Link>
            </Button>
          }
        >
          This CoachHelm dashboard is designed for players. As a coach, you can access
          player insights from the roster page.
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * CoachHelm disabled state
 */
function CoachHelmDisabledState({ reason }: { reason: string }) {
  return (
    <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
      <div className="w-full max-w-md">
        <InlineNotice
          tone="warning"
          title="CoachHelm AI Not Available"
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/golf/dashboard">Return to Dashboard</Link>
            </Button>
          }
        >
          {reason || 'CoachHelm is currently disabled for your team. Contact your coach for more information.'}
        </InlineNotice>
      </div>
    </div>
  );
}

/**
 * Player CoachHelm Dashboard Page
 *
 * Server component that:
 * 1. Authenticates the user
 * 2. Fetches player record
 * 3. Fetches CoachHelm dashboard data
 * 4. Renders the client dashboard component
 */
export default async function PlayerCoachHelmPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;

  if (!player) {
    if (coach) return <NotPlayerState />;
    return redirect('/golf/player');
  }

  // Fetch CoachHelm dashboard data, shot analytics, and the new evidence-backed
  // insight feed (top + secondary) in parallel. The insight-delivery fetchers
  // are the canonical source for the hero-card layout; `getPlayerCoachHelmDashboard`
  // still provides focus areas, prediction, and recent-round metadata.
  let dashboardResult: Awaited<ReturnType<typeof getPlayerCoachHelmDashboard>>;
  let analyticsResult: Awaited<ReturnType<typeof getPlayerShotAnalytics>>;
  let topInsight: Awaited<ReturnType<typeof getTopInsightForPlayer>> = null;
  let secondaryInsights: Awaited<ReturnType<typeof getInsightsForPlayer>> = [];
  // Hierarchical THEME scaffold (flag-gated read; only consumed in the redesign
  // fork below). A failed/rejected themes fetch MUST degrade to `[]` themes and
  // NEVER error the page, so it joins the parallel fetch via a swallow-to-null
  // wrapper rather than the fail-the-page Promise.all alongside it.
  let themesRes: Awaited<ReturnType<typeof getThemesForPlayer>> | null = null;
  try {
    [dashboardResult, analyticsResult, topInsight, secondaryInsights, themesRes] =
      await Promise.all([
        getPlayerCoachHelmDashboard(player.id),
        getPlayerShotAnalytics(player.id, 30),
        getTopInsightForPlayer(player.id),
        // Pull a small buffer — the client dedupes the hero id and displays up to 5.
        getInsightsForPlayer(player.id, { limit: 6 }),
        // Swallow to null so a themes failure can never reject the page load.
        getThemesForPlayer(player.id).catch(() => null),
      ]);
  } catch (err) {
    return <ErrorState error={err instanceof Error ? err.message : 'Failed to load dashboard data'} />;
  }

  // Fetch additional V3 data (optional — new components). Expected empty-state
  // codes (see src/lib/view-state/expected-empty-states.ts) are preserved so
  // the client empty surfaces can render the registry's copy for the ACTUAL
  // reason data is absent, instead of a generic "warming up" line.
  let profileData = null;
  let trendData = null;
  let shotData = null;
  const v3EmptyCodes: { profile?: string | null; trend?: string | null; shots?: string | null } = {};
  try {
    const { getPlayerProfile, getPlayerTrendAnalysis, getPlayerShotContext } = await import('@/app/golf/actions/coachhelm-data');
    const [profileResult, trendResult, shotResult] = await Promise.all([
      getPlayerProfile(player.id),
      getPlayerTrendAnalysis(player.id),
      getPlayerShotContext(player.id),
    ]);
    profileData = profileResult.success ? profileResult.data : null;
    trendData = trendResult.success ? trendResult.data : null;
    shotData = shotResult.success ? shotResult.data : null;
    v3EmptyCodes.profile = profileResult.success ? null : profileResult.code ?? null;
    v3EmptyCodes.trend = trendResult.success ? null : trendResult.code ?? null;
    v3EmptyCodes.shots = shotResult.success ? null : shotResult.code ?? null;
  } catch { /* V3 actions not yet available — degrade gracefully */ }

  // Handle CoachHelm disabled or other errors
  if (!dashboardResult.success) {
    const error = dashboardResult.error || 'Failed to load AI dashboard';

    // Check if CoachHelm is disabled using explicit error code (more reliable than string matching)
    if (dashboardResult.errorCode === 'COACHHELM_DISABLED') {
      return <CoachHelmDisabledState reason={error} />;
    }

    return <ErrorState error={error} />;
  }

  if (!dashboardResult.data) {
    return <ErrorState error="No dashboard data available" />;
  }

  // The warm player front door (player CoachHelmShell variant: sub-nav = Brief +
  // My Development). It receives the SAME parallel-fetched props; null V3 panels
  // degrade to honest InsufficientData INSIDE the surface (no shells), and the
  // "Ask CoachHelm about this insight" entry ships RESERVED/disabled (no
  // chat-gate lift this wave). All gate states above are shared.
  //
  // Standing snapshots (you vs team vs PGA). Convert the Map to a plain Record
  // so it serializes across the server→client boundary.
  const standingMap = await loadPlayerStandingMap(player.id);
  const standingByMetric = Object.fromEntries(standingMap) as Record<string, PlayerStanding>;
  // Hierarchical theme scaffold — degrades to `[]` on a failed/absent fetch.
  const themes = themesRes?.data?.themes ?? [];
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayPlayerCoachHelm
        data={dashboardResult.data}
        playerId={player.id}
        initialShotAnalytics={analyticsResult.success ? analyticsResult.data : null}
        profileData={profileData}
        trendData={trendData}
        shotData={shotData}
        v3EmptyCodes={v3EmptyCodes}
        topInsight={topInsight}
        secondaryInsights={secondaryInsights}
        standingByMetric={standingByMetric}
        themes={themes}
      />
    </div>
  );
}
