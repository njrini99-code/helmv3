'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { PageLoading } from '@/components/ui/loading';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconSparkles,
  IconRefresh,
  IconSettings,
  IconInfo,
  IconChartRadar,
} from '@/components/icons';
import {
  PerformancePrediction,
  AIInsightsPanel,
  FocusAreasGrid,
  RecentRoundReviews,
} from '@/components/golf/coachhelm/player';
import { ShotAnalyticsPanel } from '@/components/golf/coachhelm/analytics';
import {
  getPlayerCoachHelmDashboard,
  type PlayerCoachHelmDashboardData,
} from '@/app/golf/actions/insights';
import { getPlayerShotAnalytics, type PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';

function formatLastUpdated(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStateGradient(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return 'from-green-500/10 via-transparent to-transparent';
    case 'struggling':
      return 'from-amber-500/10 via-transparent to-transparent';
    default:
      return 'from-primary-500/10 via-transparent to-transparent';
  }
}

function getStateLabel(state: PlayerCoachHelmDashboardData['playerState']) {
  switch (state) {
    case 'improving':
      return { text: 'Trending Up', color: 'text-green-600', bgColor: 'bg-green-100' };
    case 'struggling':
      return { text: 'Focus Needed', color: 'text-amber-600', bgColor: 'bg-amber-100' };
    case 'stable':
      return { text: 'Steady Form', color: 'text-slate-600', bgColor: 'bg-slate-100' };
    default:
      return { text: 'Analyzing...', color: 'text-slate-500', bgColor: 'bg-slate-100' };
  }
}

export default function CoachHelmDashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<PlayerCoachHelmDashboardData | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [shotAnalytics, setShotAnalytics] = useState<PlayerShotAnalytics | null>(null);
  const [activeSection, setActiveSection] = useState<'insights' | 'analytics'>('insights');

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/golf/login');
        return;
      }

      // Get player record
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        setError('Player profile not found');
        setLoading(false);
        return;
      }

      setPlayerId(player.id);

      // Get CoachHelm dashboard data and shot analytics in parallel
      const [dashboardResult, analyticsResult] = await Promise.all([
        getPlayerCoachHelmDashboard(player.id),
        getPlayerShotAnalytics(player.id, 30),
      ]);

      if (!dashboardResult.success || !dashboardResult.data) {
        setError(dashboardResult.error || 'Failed to load AI dashboard');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setDashboardData(dashboardResult.data);

      // Set shot analytics if available (non-blocking)
      if (analyticsResult.success) {
        setShotAnalytics(analyticsResult.data);
      }

      setError(null);
    } catch (err) {
      console.error('Error loading CoachHelm dashboard:', err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = () => {
    loadDashboard(true);
  };

  if (loading) {
    return <PageLoading />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <IconInfo size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-warm-900 mb-2">
            Unable to Load AI Dashboard
          </h2>
          <p className="text-warm-600 mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              loadDashboard();
            }}
            className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Try Again
          </button>
        </GlassCard>
      </div>
    );
  }

  if (!dashboardData) {
    return <PageLoading />;
  }

  const stateLabel = getStateLabel(dashboardData.playerState);

  return (
    <div className="min-h-screen">
      {/* Gradient background based on state */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br pointer-events-none',
        getStateGradient(dashboardData.playerState)
      )} />

      {/* Header */}
      <div className="relative border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20"
              >
                <IconSparkles size={24} className="text-white" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
                  CoachHelm AI
                </h1>
                <p className="text-warm-500 text-sm">
                  Your personal golf intelligence
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* State badge */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  stateLabel.bgColor,
                  stateLabel.color
                )}
              >
                {stateLabel.text}
              </motion.div>

              {/* Last updated */}
              <span className="text-xs text-warm-400 hidden sm:block">
                Updated {formatLastUpdated(dashboardData.lastUpdated)}
              </span>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={cn(
                  'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 transition-all',
                  refreshing && 'animate-spin'
                )}
                title="Refresh insights"
              >
                <IconRefresh size={18} />
              </button>

              {/* Settings link */}
              <a
                href="/golf/dashboard/settings"
                className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 transition-all"
                title="AI Settings"
              >
                <IconSettings size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        {/* Section Toggle */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 p-1 bg-slate-100/80 backdrop-blur-sm rounded-xl mb-6 w-fit"
        >
          <button
            onClick={() => setActiveSection('insights')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeSection === 'insights'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <IconSparkles size={16} />
            AI Insights
          </button>
          <button
            onClick={() => setActiveSection('analytics')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeSection === 'analytics'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <IconChartRadar size={16} />
            Shot Analytics
          </button>
        </motion.div>

        {/* Insights Section */}
        {activeSection === 'insights' && (
          <motion.div
            key="insights"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column - Prediction & Focus Areas */}
              <div className="lg:col-span-5 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <PerformancePrediction
                    prediction={dashboardData.prediction}
                    playerState={dashboardData.playerState}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <FocusAreasGrid focusAreas={dashboardData.focusAreas} />
                </motion.div>
              </div>

              {/* Right Column - Insights & Recent Rounds */}
              <div className="lg:col-span-7 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                >
                  <AIInsightsPanel
                    insights={dashboardData.insights}
                    maxDisplay={5}
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <RecentRoundReviews rounds={dashboardData.recentRounds} />
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Shot Analytics Section */}
        {activeSection === 'analytics' && playerId && (
          <motion.div
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
          </motion.div>
        )}
      </div>
    </div>
  );
}
