'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import { useToast } from '@/components/ui/toast';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import {
  IconSparkles,
  IconChartRadar,
  IconInfo,
  IconRefresh,
  IconSettings,
} from '@/components/icons';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import {
  PerformancePrediction,
  FocusAreasGrid,
} from '@/components/golf/coachhelm/player';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { TrendDashboard } from '@/components/golf/coachhelm/player/TrendDashboard';
import { ShotAnalysisCard } from '@/components/golf/coachhelm/player/ShotAnalysisCard';
import { WhatIfPanel } from '@/components/golf/coachhelm/player/WhatIfPanel';
import { ShotAnalyticsPanel } from '@/components/golf/coachhelm/analytics';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import {
  HeroInsightCard,
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';

async function loadCoachHelmActions() {
  const [{ getPlayerCoachHelmDashboard }, { getPlayerShotAnalytics }] = await Promise.all([
    import('@/app/golf/actions/insights'),
    import('@/app/golf/actions/shot-analytics'),
  ]);

  return { getPlayerCoachHelmDashboard, getPlayerShotAnalytics };
}

interface PlayerCoachHelmDashboardProps {
  data: PlayerCoachHelmDashboardData;
  playerId: string;
  initialShotAnalytics?: PlayerShotAnalytics | null;
  /** V3 optional data — degrades gracefully if not available */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any> | null;
  /** The single highest-impact evidence-backed insight — hero card. */
  topInsight?: EvidenceInsight | null;
  /** The rest of the evidence-backed feed — stacked below the hero. The
   *  component dedupes the hero id in case it appears in this list too. */
  secondaryInsights?: EvidenceInsight[];
}

/**
 * Returns gradient based on player state for background effect
 */
function getStateGradient(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return 'from-primary-500/10 via-transparent to-transparent';
    case 'struggling':
      return 'from-amber-500/10 via-transparent to-transparent';
    default:
      return 'from-primary-500/10 via-transparent to-transparent';
  }
}

/**
 * Empty state component for when no data is available at all.
 */
function EmptyState() {
  return (
    <GlassCard className="text-center py-16">
      <div className="w-20 h-20 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-6">
        <IconInfo size={40} className="text-warm-400" />
      </div>
      <h3 className="text-xl font-semibold text-warm-900 mb-2">
        No Insights Available Yet
      </h3>
      <p className="text-warm-600 mb-6 max-w-md mx-auto">
        Complete a few rounds to unlock AI-powered insights about your game.
        CoachHelm analyzes your performance patterns to provide personalized recommendations.
      </p>
      <a
        href="/golf/dashboard/rounds/new"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
      >
        <IconSparkles size={16} />
        Log Your First Round
      </a>
    </GlassCard>
  );
}

/**
 * Inline note shown when the evidence-backed insight feed is empty but the
 * rest of the dashboard (focus areas, prediction, trends) has data. Kept
 * compact so it doesn't dominate the left column beside a populated right
 * column.
 */
function EmptyInsightsState({ hasRounds }: { hasRounds: boolean }) {
  return (
    <GlassCard className="py-5 px-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
          <IconSparkles size={18} className="text-warm-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warm-900">
            No evidence-backed insights yet
          </p>
          <p className="text-xs text-warm-500 mt-0.5">
            {hasRounds
              ? 'Evidence-backed insights surface once patterns hold across multiple rounds. Your focus areas and trends are live on the right.'
              : 'Log a few rounds and CoachHelm will surface the patterns that move your scores.'}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

export function PlayerCoachHelmDashboard({
  data: initialData,
  playerId,
  initialShotAnalytics,
  profileData,
  trendData,
  shotData,
  topInsight = null,
  secondaryInsights = [],
}: PlayerCoachHelmDashboardProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [dashboardData, setDashboardData] = useState<PlayerCoachHelmDashboardData>(initialData);
  const [shotAnalytics, setShotAnalytics] = useState<PlayerShotAnalytics | null>(initialShotAnalytics ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<'insights' | 'analytics'>('insights');
  const [activeBottomTab, setActiveBottomTab] = useState<'shot-analysis' | 'what-if'>('shot-analysis');
  const sectionTabs = [
    { id: 'insights' as const, label: 'AI Insights', icon: <IconSparkles size={16} /> },
    { id: 'analytics' as const, label: 'Shot Analytics', icon: <IconChartRadar size={16} /> },
  ];
  const bottomTabs = [
    { id: 'shot-analysis' as const, label: 'Shot Analysis' },
    { id: 'what-if' as const, label: 'What If' },
  ];

  /**
   * Refresh dashboard data from server
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const { getPlayerCoachHelmDashboard, getPlayerShotAnalytics } = await loadCoachHelmActions();
      const [dashboardResult, analyticsResult] = await Promise.all([
        getPlayerCoachHelmDashboard(playerId),
        getPlayerShotAnalytics(playerId, 30),
      ]);

      if (dashboardResult.success && dashboardResult.data) {
        setDashboardData(dashboardResult.data);
      }

      if (analyticsResult.success && analyticsResult.data) {
        setShotAnalytics(analyticsResult.data);
      }

      // Refresh the page data — server component re-runs the insight-delivery
      // fetchers and passes fresh top/secondary props in.
      router.refresh();
    } catch {
      // Silently ignore refresh errors
    } finally {
      setRefreshing(false);
    }
  }, [playerId, router]);

  /**
   * Unified handler wired into every `<InsightCard>` + `<HeroInsightCard>` on
   * this surface. Maps the primitive's action union onto the existing
   * `rateInsightAsPlayer` server action, with toast feedback.
   *
   * `open_details` is a no-op here — we're already on the insight-delivery
   * surface. Coach actions (`create_focus_area`) shouldn't fire on the player
   * dashboard either; we log the UI bug path defensively.
   */
  const handleInsightAction = useCallback(
    async (action: InsightAction, insightId: string) => {
      if (action === 'open_details' || action === 'view_drill') {
        // These are surface-local; the primitive handles them inline (drill
        // chip sheet). No server roundtrip required.
        return;
      }

      if (action === 'create_focus_area') {
        // Coach-only action shouldn't arrive here, but don't crash if it does.
        addToast({
          type: 'error',
          title: 'Unavailable',
          description: 'Focus areas are created from the coach dashboard.',
        });
        return;
      }

      const ratingMap: Record<
        Exclude<InsightAction, 'open_details' | 'view_drill' | 'create_focus_area'>,
        'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed'
      > = {
        rate_helpful: 'helpful',
        rate_not_helpful: 'not_helpful',
        acknowledged: 'acknowledged',
        dismissed: 'dismissed',
      };
      const rating = ratingMap[action];

      const successCopy = getToastCopyForAction(action);

      try {
        await rateInsightAsPlayer({ insightId, rating });
        addToast({ type: 'success', ...successCopy });
        router.refresh();
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Could not save feedback',
          description: err instanceof Error ? err.message : 'Please try again in a moment.',
        });
      }
    },
    [addToast, router],
  );

  // Dedupe — the top insight is also in the `getInsightsForPlayer` result;
  // drop it from the secondary list so we don't render the same card twice.
  // We also cap the visible list at 5 to match the prior density.
  const secondaryFiltered = useMemo(
    () =>
      secondaryInsights
        .filter((i) => !topInsight || i.id !== topInsight.id)
        .slice(0, 5),
    [secondaryInsights, topInsight],
  );

  const hasAnyInsight = Boolean(topInsight) || secondaryFiltered.length > 0;

  // Dashboard-level data presence check. We now treat evidence-backed insights
  // + the legacy focus-area / prediction shape as interchangeable signals that
  // "some content exists" — so the dashboard doesn't collapse to the big
  // EmptyState when only the new insight feed is populated.
  const hasData =
    hasAnyInsight ||
    dashboardData.focusAreas.length > 0 ||
    dashboardData.prediction !== null ||
    dashboardData.recentRounds.length > 0 ||
    profileData != null ||
    trendData != null ||
    shotData != null;

  return (
    <div className="min-h-full">
      {/* Gradient background based on state */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br pointer-events-none',
        getStateGradient(dashboardData.playerState)
      )} />

      {/* Header */}
      <LargeTitleHeader
        title="CoachHelm AI"
        subtitle="Your personal golf intelligence"
      >
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={cn(
            'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all flex-shrink-0',
            refreshing && 'animate-spin pointer-events-none'
          )}
          title="Refresh insights"
          aria-label="Refresh insights"
        >
          <IconRefresh size={18} />
        </button>
        <Link
          href="/golf/dashboard/settings"
          className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 active:bg-white/70 transition-all flex-shrink-0"
          title="AI Settings"
          aria-label="AI Settings"
        >
          <IconSettings size={18} />
        </Link>
      </LargeTitleHeader>

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Empty state */}
        {!hasData && <EmptyState />}

        {/* Dashboard content — animations simplified for mobile performance.
            Only the section switch animates; interior content renders instantly. */}
        {hasData && (
          <>
            {/* Section Toggle */}
            <div className="mb-6">
              <GolfTabBar
                tabs={sectionTabs}
                value={activeSection}
                onChange={setActiveSection}
                ariaLabel="CoachHelm sections"
              />
            </div>

            {/* Insights Section */}
            <AnimatePresence mode="wait" initial={false}>
              {activeSection === 'insights' && (
                <m.div
                  key="insights"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Top Row — Composite Rating + Trend Dashboard */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6 mb-6">
                    <CompositeRatingCard
                      profileData={profileData ?? undefined}
                      playerState={dashboardData.playerState}
                      playerName={dashboardData.playerName}
                    />
                    <TrendDashboard
                      trendData={trendData ?? undefined}
                      playerState={dashboardData.playerState}
                    />
                  </div>

                  {/* Main Content — 2 columns */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 mb-6">
                    {/* Left Column — Hero insight + secondary feed */}
                    <div className="lg:col-span-7 space-y-5 md:space-y-6 min-w-0">
                      {topInsight && (
                        <HeroInsightCard
                          insight={topInsight}
                          audience="player"
                          onAction={handleInsightAction}
                        />
                      )}

                      {secondaryFiltered.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium text-warm-500 px-1">
                            {topInsight ? 'More for you' : 'Your insights'}
                          </h3>
                          {secondaryFiltered.map((insight) => (
                            <InsightCard
                              key={insight.id}
                              insight={insight}
                              density="default"
                              audience="player"
                              onAction={handleInsightAction}
                            />
                          ))}
                        </div>
                      )}

                      {!topInsight && secondaryFiltered.length === 0 && (
                        (() => {
                          // Suppress the inline empty card entirely when the
                          // right column is populated — focus areas + prediction
                          // already anchor the view, and the big "No insights"
                          // card just adds noise in that case.
                          const rightColumnHasContent =
                            dashboardData.focusAreas.length > 0 ||
                            dashboardData.prediction !== null;
                          if (rightColumnHasContent) return null;
                          return (
                            <EmptyInsightsState
                              hasRounds={dashboardData.recentRounds.length > 0}
                            />
                          );
                        })()
                      )}
                    </div>

                    {/* Right Column — Focus Areas, Prediction */}
                    <div className="lg:col-span-5 space-y-5 md:space-y-6 min-w-0">
                      <section id="focus-areas" className="scroll-mt-24">
                        <FocusAreasGrid focusAreas={dashboardData.focusAreas} />
                      </section>
                      <PerformancePrediction
                        prediction={dashboardData.prediction}
                        playerState={dashboardData.playerState}
                      />
                    </div>
                  </div>

                  {/* Bottom Row — Tabbed: Shot Analysis | What If.
                      Labelled as "Deep dive" so it visually reads as a
                      sub-section of AI Insights, not as competing primary
                      navigation with the top section toggle. */}
                  <div className="flex items-center justify-between gap-3 mb-3 mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                      Deep dive
                    </p>
                    <GolfTabBar
                      tabs={bottomTabs}
                      value={activeBottomTab}
                      onChange={setActiveBottomTab}
                      ariaLabel="Analysis sections"
                      compact
                    />
                  </div>
                  <div>
                    <AnimatePresence mode="wait" initial={false}>
                      {activeBottomTab === 'shot-analysis' && (
                        <m.div
                          key="shot-analysis"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ShotAnalysisCard
                            shotData={shotData ?? undefined}
                            playerId={playerId}
                          />
                        </m.div>
                      )}
                      {activeBottomTab === 'what-if' && (
                        <m.div
                          key="what-if"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <WhatIfPanel
                            playerId={playerId}
                            profileData={profileData ?? undefined}
                          />
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </m.div>
              )}

              {/* Shot Analytics Section */}
              {activeSection === 'analytics' && (
                <m.div
                  key="analytics"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ShotAnalyticsPanel
                    playerId={playerId}
                    playerName={dashboardData.playerName}
                    initialData={shotAnalytics}
                    periodDays={30}
                  />
                </m.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Toast copy keyed by InsightAction. Extracted so the handler stays flat.
 */
function getToastCopyForAction(
  action: Exclude<InsightAction, 'open_details' | 'view_drill' | 'create_focus_area'>,
): { title: string; description: string } {
  switch (action) {
    case 'rate_helpful':
      return {
        title: 'Thanks for the feedback',
        description: 'CoachHelm will show you more like this.',
      };
    case 'rate_not_helpful':
      return {
        title: "Got it — we'll tune your insights",
        description: 'CoachHelm will show fewer insights like this.',
      };
    case 'acknowledged':
      return {
        title: 'Acknowledged',
        description: "We'll mark this insight as seen.",
      };
    case 'dismissed':
      return {
        title: 'Insight dismissed',
        description: 'Removed from your active insights.',
      };
  }
}
