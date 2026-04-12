'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
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
  AIInsightsPanel,
  FocusAreasGrid,
} from '@/components/golf/coachhelm/player';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { TrendDashboard } from '@/components/golf/coachhelm/player/TrendDashboard';
import { ShotAnalysisCard } from '@/components/golf/coachhelm/player/ShotAnalysisCard';
import { WhatIfPanel } from '@/components/golf/coachhelm/player/WhatIfPanel';
import { ShotAnalyticsPanel } from '@/components/golf/coachhelm/analytics';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
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
 * Empty state component for when no data is available
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

export function PlayerCoachHelmDashboard({
  data: initialData,
  playerId,
  initialShotAnalytics,
  profileData,
  trendData,
  shotData,
}: PlayerCoachHelmDashboardProps) {
  const router = useRouter();
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

      // Refresh the page data
      router.refresh();
    } catch {
      // Silently ignore refresh errors
    } finally {
      setRefreshing(false);
    }
  }, [playerId, router]);

  // Check if we have meaningful data
  const hasData = dashboardData.insights.length > 0 ||
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
                    {/* Left Column — AI Insights */}
                    <div className="lg:col-span-7 space-y-5 md:space-y-6 min-w-0">
                      <AIInsightsPanel
                        insights={dashboardData.insights}
                        maxDisplay={5}
                      />
                    </div>

                    {/* Right Column — Focus Areas, Prediction */}
                    <div className="lg:col-span-5 space-y-5 md:space-y-6 min-w-0">
                      <FocusAreasGrid focusAreas={dashboardData.focusAreas} />
                      <PerformancePrediction
                        prediction={dashboardData.prediction}
                        playerState={dashboardData.playerState}
                      />
                    </div>
                  </div>

                  {/* Bottom Row — Tabbed: Shot Analysis | What If */}
                  <GolfTabBar
                    tabs={bottomTabs}
                    value={activeBottomTab}
                    onChange={setActiveBottomTab}
                    ariaLabel="Analysis sections"
                    compact
                  />
                  <div className="mt-4">
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
