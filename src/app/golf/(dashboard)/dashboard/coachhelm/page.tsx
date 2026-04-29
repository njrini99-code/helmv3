import { redirect } from 'next/navigation';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { GlassCard } from '@/components/ui/glass-card';
import { IconInfo, IconSparkles } from '@/components/icons';
import { getPlayerCoachHelmDashboard } from '@/app/golf/actions/insights';
import { getPlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import {
  getTopInsightForPlayer,
  getInsightsForPlayer,
} from '@/app/golf/actions/insight-delivery';
import { PlayerCoachHelmDashboard } from './components/PlayerCoachHelmDashboard';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CoachHelm | GolfHelm',
  description: 'AI-powered insights, predictions, and focus areas for your golf performance.',
};

/**
 * Error state component for displaying errors gracefully
 */
function ErrorState({ error }: { error: string }) {
  return (
    <AnimatedPage>
      <AnimatedItem>
        <div className="min-h-full flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-red-500/5 via-transparent to-transparent">
          <GlassCard className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <IconInfo size={32} className="text-red-500" />
            </div>
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">
              Unable to Load AI Dashboard
            </h2>
            <p className="text-warm-600 mb-6">{error}</p>
            <a
              href="/golf/dashboard/coachhelm"
              className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Again
            </a>
          </GlassCard>
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}

/**
 * Not a player error state - shown when user is a coach or has no player profile
 */
function NotPlayerState() {
  return (
    <AnimatedPage>
      <AnimatedItem>
        <div className="min-h-full flex items-center justify-center p-4 md:p-6">
          <GlassCard className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <IconSparkles size={32} className="text-amber-500" />
            </div>
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">
              Player Dashboard Only
            </h2>
            <p className="text-warm-600 mb-6">
              This CoachHelm dashboard is designed for players. As a coach, you can access
              player insights from the roster page.
            </p>
            <a
              href="/golf/dashboard"
              className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Go to Dashboard
            </a>
          </GlassCard>
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}

/**
 * CoachHelm disabled state
 */
function CoachHelmDisabledState({ reason }: { reason: string }) {
  return (
    <AnimatedPage>
      <AnimatedItem>
        <div className="min-h-full flex items-center justify-center p-4 md:p-6">
          <GlassCard className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconSparkles size={32} className="text-warm-400" />
            </div>
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.015em] mb-2">
              CoachHelm AI Not Available
            </h2>
            <p className="text-warm-600 mb-6">
              {reason || 'CoachHelm is currently disabled for your team. Contact your coach for more information.'}
            </p>
            <a
              href="/golf/dashboard"
              className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Return to Dashboard
            </a>
          </GlassCard>
        </div>
      </AnimatedItem>
    </AnimatedPage>
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
  try {
    [dashboardResult, analyticsResult, topInsight, secondaryInsights] = await Promise.all([
      getPlayerCoachHelmDashboard(player.id),
      getPlayerShotAnalytics(player.id, 30),
      getTopInsightForPlayer(player.id),
      // Pull a small buffer — the client dedupes the hero id and displays up to 5.
      getInsightsForPlayer(player.id, { limit: 6 }),
    ]);
  } catch (err) {
    return <ErrorState error={err instanceof Error ? err.message : 'Failed to load dashboard data'} />;
  }

  // Fetch additional V3 data (optional — new components)
  let profileData = null;
  let trendData = null;
  let shotData = null;
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

  // Render the dashboard
  return (
    <AnimatedPage>
      <AnimatedItem>
        <PlayerCoachHelmDashboard
          data={dashboardResult.data}
          playerId={player.id}
          initialShotAnalytics={analyticsResult.success ? analyticsResult.data : null}
          profileData={profileData}
          trendData={trendData}
          shotData={shotData}
          topInsight={topInsight}
          secondaryInsights={secondaryInsights}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}
