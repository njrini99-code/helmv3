'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { getAdminDashboardData } from '@/app/golf/actions/admin-data';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { AdminStatCard } from './components/AdminStatCard';
import { PlatformHealthCard } from './components/PlatformHealthCard';
import { UserBreakdownCard } from './components/UserBreakdownCard';
import { UsageMetricsCard } from './components/UsageMetricsCard';
import { CoachHelmHealthCard } from './components/CoachHelmHealthCard';
import { TeamIntelligenceCard } from './components/TeamIntelligenceCard';
import { ScoringIntelligenceCard } from './components/ScoringIntelligenceCard';
import { EngagementCard } from './components/EngagementCard';
import { ActivityFeed } from './components/ActivityFeed';
import { GrowthCard } from './components/GrowthCard';
import { UserActivityTable } from './components/UserActivityTable';
import { TeamRosterCard } from './components/TeamRosterCard';
import { DailyCharts } from './components/DailyCharts';
import {
  IconUsers,
  IconTarget,
  IconSparkles,
  IconWarning,
  IconLogOut,
  IconRefresh,
  IconActivity,
  IconTrendingUp,
  IconChart,
  IconEye,
} from '@/components/icons';

// ============================================
// TAB DEFINITIONS
// ============================================
const TABS = [
  { id: 'business', label: 'Business', icon: IconChart },
  { id: 'visibility', label: 'Users & Teams', icon: IconEye },
  { id: 'overview', label: 'Overview', icon: IconActivity },
  { id: 'teams', label: 'Teams & Scoring', icon: IconTarget },
  { id: 'users', label: 'Users & Usage', icon: IconUsers },
  { id: 'ai', label: 'CoachHelm AI', icon: IconSparkles },
  { id: 'engagement', label: 'Engagement', icon: IconTrendingUp },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AUTO_REFRESH_INTERVAL = 60000; // 60 seconds

// ============================================
// SKELETON LOADERS
// ============================================
function StatSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 animate-pulse">
      <div className="h-4 w-24 bg-warm-200 rounded mb-3" />
      <div className="h-8 w-16 bg-warm-200 rounded" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 animate-pulse">
      <div className="h-5 w-36 bg-warm-200 rounded mb-4" />
      <div className="space-y-3">
        <div className="h-3 w-full bg-warm-100 rounded" />
        <div className="h-3 w-3/4 bg-warm-100 rounded" />
        <div className="h-3 w-1/2 bg-warm-100 rounded" />
        <div className="h-24 w-full bg-warm-100 rounded-lg" />
      </div>
    </div>
  );
}

// ============================================
// QUICK PULSE PILLS
// ============================================
function QuickPulse({ data }: { data: AdminDashboardData }) {
  const pills = [
    {
      label: 'Growth',
      value: `${data.growth.userGrowthRate > 0 ? '+' : ''}${data.growth.userGrowthRate}%`,
      color: data.growth.userGrowthRate > 0 ? 'bg-emerald-50 text-emerald-700' : data.growth.userGrowthRate < 0 ? 'bg-red-50 text-red-700' : 'bg-warm-100 text-warm-600',
    },
    {
      label: 'Retention',
      value: `${data.engagement.weeklyRetention}%`,
      color: data.engagement.weeklyRetention > 30 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
    },
    {
      label: 'AI Adoption',
      value: `${data.coachhelm.coachPhilosophyAdoption}%`,
      color: data.coachhelm.coachPhilosophyAdoption > 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Health',
      value: `${data.growth.platformHealthScore}/100`,
      color: data.growth.platformHealthScore >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pills.map((p) => (
        <div key={p.label} className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', p.color)}>
          <span className="text-[10px] opacity-70 uppercase tracking-wide">{p.label}</span>
          <span className="font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('business');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const result = await getAdminDashboardData();
      setData(result);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60s
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadData(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [loadData]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/golf/login');
  }

  function handleManualRefresh() {
    loadData(true);
  }

  return (
    <div className="min-h-screen bg-[#FFFEFA] relative">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[500px] h-[500px] -top-32 -right-32 rounded-full bg-gradient-to-br from-helm-green-400/20 to-helm-green-500/10 blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] -bottom-24 -left-24 rounded-full bg-gradient-to-tr from-helm-green-400/15 to-helm-green-400/10 blur-3xl"
          animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 0.95, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(16,185,129,0.5) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(16,185,129,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/20 bg-white/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
                unoptimized
              />
              <div>
                <h1 className="text-lg font-bold text-warm-900">Command Center</h1>
                <p className="text-xs text-warm-400">GolfHelm Admin</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Live indicator + refresh */}
              <div className="flex items-center gap-2">
                {isRefreshing && (
                  <div className="w-4 h-4">
                    <IconRefresh size={16} className="text-primary-500 animate-spin" />
                  </div>
                )}
                {!isRefreshing && data && (
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
                    </div>
                    <span className="text-xs text-warm-400">Live</span>
                  </div>
                )}
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 transition-all disabled:opacity-50"
                  title="Refresh data"
                >
                  <IconRefresh size={16} />
                </button>
              </div>
              {lastRefresh && (
                <span className="text-[10px] text-warm-400 hidden sm:block tabular-nums">
                  Updated {lastRefresh.toLocaleTimeString()}
                </span>
              )}
              <div className="w-px h-6 bg-warm-200" />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 text-sm text-warm-500 hover:text-warm-700 transition-colors px-3 py-2 rounded-lg hover:bg-white/50"
              >
                <IconLogOut size={16} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      {data && !loading && (
        <nav className="relative z-10 border-b border-white/20 bg-white/30 backdrop-blur-md sticky top-16">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                      isActive
                        ? 'bg-white/70 text-warm-900 shadow-sm'
                        : 'text-warm-500 hover:text-warm-700 hover:bg-white/40'
                    )}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Content */}
      <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-sm text-red-500 underline hover:text-red-700"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        ) : data ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              {/* ============================================ */}
              {/* BUSINESS TAB */}
              {/* ============================================ */}
              {activeTab === 'business' && (
                <>
                  {/* Quick Pulse */}
                  <QuickPulse data={data} />

                  {/* Business KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <AdminStatCard
                      label="Total Users"
                      value={data.users.totalCoaches + data.users.totalPlayers + data.users.totalAdmins}
                      icon={<IconUsers size={20} />}
                      trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Rounds This Week"
                      value={data.health.roundsThisWeek}
                      icon={<IconTarget size={20} />}
                      trend={{ value: data.growth.roundGrowthRate, label: 'vs last week' }}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Churned (30d)"
                      value={data.growth.churnedPlayers30d}
                      icon={<IconWarning size={20} />}
                      detail="players went inactive"
                      accentColor={data.growth.churnedPlayers30d > 0 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="Power Users"
                      value={`${data.growth.npsProxy}`}
                      suffix="%"
                      icon={<IconSparkles size={20} />}
                      detail="coaches fully engaged"
                      accentColor={data.growth.npsProxy > 30 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Health Score"
                      value={data.growth.platformHealthScore}
                      suffix="/100"
                      icon={<IconActivity size={20} />}
                      accentColor={data.growth.platformHealthScore >= 50 ? 'green' : 'red'}
                    />
                  </div>

                  {/* Business cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GrowthCard
                      growth={data.growth}
                      users={data.users}
                      usage={data.usage}
                      coachhelm={data.coachhelm}
                    />
                    <div className="space-y-6">
                      <EngagementCard
                        engagement={data.engagement}
                        totalPlayers={data.users.totalPlayers}
                        totalCoaches={data.users.totalCoaches}
                      />
                      <ActivityFeed activity={data.activity} />
                    </div>
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* USERS & TEAMS VISIBILITY TAB */}
              {/* ============================================ */}
              {activeTab === 'visibility' && (
                <>
                  {/* Daily charts: signups + active users */}
                  <DailyCharts
                    signupsByDay={data.signupsByDay}
                    visitsByDay={data.visitsByDay}
                  />

                  {/* Team Rosters - full visibility */}
                  <TeamRosterCard teamRosters={data.teamRosters} />

                  {/* Full User Directory */}
                  <UserActivityTable users={data.userDirectory} />
                </>
              )}

              {/* ============================================ */}
              {/* OVERVIEW TAB */}
              {/* ============================================ */}
              {activeTab === 'overview' && (
                <>
                  {/* Quick Pulse */}
                  <QuickPulse data={data} />

                  {/* Health KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <AdminStatCard
                      label="Active Users (7d)"
                      value={data.health.activeUsers7d}
                      icon={<IconUsers size={20} />}
                      trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
                      detail={`${data.health.activeUsers24h} in 24h / ${data.health.activeUsers30d} in 30d`}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Rounds This Week"
                      value={data.health.roundsThisWeek}
                      icon={<IconTarget size={20} />}
                      trend={{ value: data.growth.roundGrowthRate, label: 'vs last week' }}
                      detail={`${data.health.roundsToday} today`}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="AI Reviews & Insights"
                      value={data.health.roundReviewsThisWeek + data.health.insightsThisWeek}
                      icon={<IconSparkles size={20} />}
                      detail={`${data.health.roundReviewsThisWeek} reviews, ${data.health.insightsThisWeek} insights`}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Platform Scoring Avg"
                      value={data.scoring.platformScoringAvg?.toFixed(1) ?? '\u2014'}
                      icon={<IconChart size={20} />}
                      detail={`${data.usage.totalRounds.toLocaleString()} total rounds`}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="System Errors (7d)"
                      value={data.health.systemErrors7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.health.systemErrors7d > 0 ? 'red' : 'green'}
                      detail={`${data.health.avgResponseTimeMs}ms API`}
                    />
                  </div>

                  {/* Main overview grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <PlatformHealthCard health={data.health} />
                    <ScoringIntelligenceCard scoring={data.scoring} />
                    <ActivityFeed activity={data.activity} />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* TEAMS & SCORING TAB */}
              {/* ============================================ */}
              {activeTab === 'teams' && (
                <>
                  {/* Scoring KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard
                      label="Platform Scoring Avg"
                      value={data.scoring.platformScoringAvg?.toFixed(1) ?? '\u2014'}
                      icon={<IconTarget size={20} />}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Fairway %"
                      value={data.scoring.platformFairwayPct != null ? `${data.scoring.platformFairwayPct.toFixed(0)}` : '\u2014'}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="GIR %"
                      value={data.scoring.platformGirPct != null ? `${data.scoring.platformGirPct.toFixed(0)}` : '\u2014'}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Putts per Round"
                      value={data.scoring.platformPuttsPerRound?.toFixed(1) ?? '\u2014'}
                      icon={<IconTarget size={20} />}
                      accentColor="blue"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TeamIntelligenceCard teams={data.teams} />
                    <ScoringIntelligenceCard scoring={data.scoring} />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* USERS & USAGE TAB */}
              {/* ============================================ */}
              {activeTab === 'users' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard
                      label="Total Users"
                      value={data.users.totalCoaches + data.users.totalPlayers + data.users.totalAdmins}
                      icon={<IconUsers size={20} />}
                      trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
                      detail={`${data.users.newUsersThisWeek} new this week`}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Active Teams"
                      value={data.users.activeTeams}
                      icon={<IconUsers size={20} />}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Total Shots Tracked"
                      value={data.usage.totalShots.toLocaleString()}
                      icon={<IconTarget size={20} />}
                      detail={`${data.usage.avgShotsPerRound} avg/round`}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Data Quality"
                      value={`${data.usage.roundsCompletionRate}%`}
                      icon={<IconChart size={20} />}
                      detail={`${data.usage.verifiedRoundsRate}% verified`}
                      accentColor={data.usage.roundsCompletionRate > 80 ? 'green' : 'amber'}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <UserBreakdownCard users={data.users} />
                    <UsageMetricsCard usage={data.usage} />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* COACHHELM AI TAB */}
              {/* ============================================ */}
              {activeTab === 'ai' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <AdminStatCard
                      label="Reviews (All Time)"
                      value={data.coachhelm.totalReviewsAllTime.toLocaleString()}
                      icon={<IconSparkles size={20} />}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Patterns Detected"
                      value={data.coachhelm.totalPatternsDetected.toLocaleString()}
                      icon={<IconActivity size={20} />}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Predictions Made"
                      value={data.coachhelm.totalPredictionsMade.toLocaleString()}
                      icon={<IconTrendingUp size={20} />}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Philosophy Adoption"
                      value={`${data.coachhelm.coachPhilosophyAdoption}`}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      accentColor={data.coachhelm.coachPhilosophyAdoption > 50 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Avg Insights/Gen"
                      value={data.coachhelm.avgInsightsPerGeneration}
                      icon={<IconSparkles size={20} />}
                      accentColor="blue"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CoachHelmHealthCard coachhelm={data.coachhelm} />
                    <ActivityFeed activity={data.activity} />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* ENGAGEMENT TAB */}
              {/* ============================================ */}
              {activeTab === 'engagement' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard
                      label="Weekly Active Rate"
                      value={`${data.engagement.weeklyRetention}`}
                      suffix="%"
                      icon={<IconTrendingUp size={20} />}
                      accentColor={data.engagement.weeklyRetention > 30 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Avg Rounds / Player"
                      value={data.engagement.avgRoundsPerPlayer}
                      icon={<IconTarget size={20} />}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Inactive Players"
                      value={data.engagement.playersWithNoRounds}
                      icon={<IconWarning size={20} />}
                      detail={`of ${data.users.totalPlayers} total`}
                      accentColor={data.engagement.playersWithNoRounds > 0 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="Coaches Using AI"
                      value={data.engagement.coachesUsingInsights}
                      icon={<IconSparkles size={20} />}
                      detail={`of ${data.users.totalCoaches} total`}
                      accentColor="green"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <EngagementCard
                      engagement={data.engagement}
                      totalPlayers={data.users.totalPlayers}
                      totalCoaches={data.users.totalCoaches}
                    />
                    <ActivityFeed activity={data.activity} />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        ) : null}
      </main>
    </div>
  );
}
