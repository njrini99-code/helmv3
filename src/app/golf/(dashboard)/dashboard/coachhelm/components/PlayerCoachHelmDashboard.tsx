'use client';

import { useState, useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconChartRadar,
  IconInfo,
} from '@/components/icons';
import {
  PerformancePrediction,
  AIInsightsPanel,
  FocusAreasGrid,
  RecentRoundReviews,
} from '@/components/golf/coachhelm/player';
import { ShotAnalyticsPanel } from '@/components/golf/coachhelm/analytics';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import { CoachHelmHeader } from './CoachHelmHeader';
import { PlayerStateCard } from './PlayerStateCard';

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
}: PlayerCoachHelmDashboardProps) {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<PlayerCoachHelmDashboardData>(initialData);
  const [shotAnalytics, setShotAnalytics] = useState<PlayerShotAnalytics | null>(initialShotAnalytics ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<'insights' | 'analytics'>('insights');
  const sectionTabs = [
    { id: 'insights' as const, label: 'AI Insights', icon: <IconSparkles size={16} /> },
    { id: 'analytics' as const, label: 'Shot Analytics', icon: <IconChartRadar size={16} /> },
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
                  dashboardData.recentRounds.length > 0;

  return (
    <div className="min-h-full">
      {/* Gradient background based on state */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br pointer-events-none',
        getStateGradient(dashboardData.playerState)
      )} />

      {/* Header */}
      <CoachHelmHeader
        lastUpdated={dashboardData.lastUpdated}
        alertLevel={dashboardData.alertLevel}
        playerState={dashboardData.playerState}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
      />

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Empty state */}
        {!hasData && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <EmptyState />
          </m.div>
        )}

        {/* Dashboard content */}
        {hasData && (
          <>
            {/* Section Toggle */}
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <GolfTabBar
                tabs={sectionTabs}
                value={activeSection}
                onChange={setActiveSection}
                ariaLabel="CoachHelm sections"
              />
            </m.div>

            {/* Insights Section */}
            <AnimatePresence mode="wait">
              {activeSection === 'insights' && (
                <m.div
                  key="insights"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column - State, Prediction & Focus Areas */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* Player State Card - Hero card showing current form */}
                      <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        <PlayerStateCard
                          playerState={dashboardData.playerState}
                          playerName={dashboardData.playerName}
                        />
                      </m.div>

                      {/* Performance Prediction */}
                      <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 }}
                      >
                        <PerformancePrediction
                          prediction={dashboardData.prediction}
                          playerState={dashboardData.playerState}
                        />
                      </m.div>

                      {/* Focus Areas */}
                      <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <FocusAreasGrid focusAreas={dashboardData.focusAreas} />
                      </m.div>
                    </div>

                    {/* Right Column - Insights & Recent Rounds */}
                    <div className="lg:col-span-7 space-y-6">
                      {/* AI Insights */}
                      <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                      >
                        <AIInsightsPanel
                          insights={dashboardData.insights}
                          maxDisplay={5}
                        />
                      </m.div>

                      {/* Recent Round Reviews */}
                      <m.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                      >
                        <RecentRoundReviews rounds={dashboardData.recentRounds} />
                      </m.div>
                    </div>
                  </div>
                </m.div>
              )}

              {/* Shot Analytics Section */}
              {activeSection === 'analytics' && (
                <m.div
                  key="analytics"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
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
