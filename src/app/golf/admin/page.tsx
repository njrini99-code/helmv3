'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { InsightCallout } from './components/InsightCallout';
import { NeedsAttention } from './components/NeedsAttention';
import { HealthCheckGrid } from './components/HealthCheckGrid';
import { ErrorFeed } from './components/ErrorFeed';
import { AuditFeed } from './components/AuditFeed';
import { BaseballOps } from './components/BaseballOps';
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
  IconShield,
} from '@/components/icons';

// ============================================
// TAB DEFINITIONS — 6 tabs
// ============================================
const TABS = [
  { id: 'command', label: 'Command Center', icon: IconActivity, shortcut: '1' },
  { id: 'users', label: 'Users & Activity', icon: IconUsers, shortcut: '2' },
  { id: 'health', label: 'Health & Issues', icon: IconWarning, shortcut: '3' },
  { id: 'analytics', label: 'Analytics & Growth', icon: IconTrendingUp, shortcut: '4' },
  { id: 'sports', label: 'Sport Operations', icon: IconTarget, shortcut: '5' },
  { id: 'audit', label: 'Audit & Security', icon: IconShield, shortcut: '6' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AUTO_REFRESH_INTERVAL = 60000;

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
// PERSISTENT STATUS BAR
// ============================================
function StatusBar({
  data,
  isRefreshing,
  lastRefresh,
  onTabClick,
}: {
  data: AdminDashboardData;
  isRefreshing: boolean;
  lastRefresh: Date | null;
  onTabClick: (tab: TabId) => void;
}) {
  const overallHealth = data.health.diagnostics.some((d) => d.status === 'critical')
    ? 'critical'
    : data.health.diagnostics.some((d) => d.status === 'warning')
      ? 'warning'
      : 'healthy';

  const healthDot = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
  };

  const healthLabel = {
    healthy: 'Platform Healthy',
    warning: 'Needs Attention',
    critical: 'Issues Detected',
  };

  const healthText = {
    healthy: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-red-700',
  };

  const activeNow = data.health.realActiveUsers1h;
  const errorCount = data.errorLogs.totalErrors7d;
  const criticalCount = data.errorLogs.criticalErrors7d;

  return (
    <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-2 text-xs">
      <div className="flex items-center gap-4">
        {/* Health status */}
        <button
          onClick={() => onTabClick('health')}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <div className="relative">
            <div className={cn('w-2 h-2 rounded-full', healthDot[overallHealth])} />
            <div className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-75', healthDot[overallHealth])} />
          </div>
          <span className={cn('font-medium', healthText[overallHealth])}>
            {healthLabel[overallHealth]}
          </span>
        </button>

        <span className="text-warm-300 hidden sm:inline">|</span>

        {/* Active users */}
        <span className="text-warm-500 hidden sm:inline">
          <span className="font-semibold text-warm-700 tabular-nums">{activeNow}</span> active now
        </span>

        <span className="text-warm-300 hidden sm:inline">|</span>

        {/* Error count */}
        <button
          onClick={() => onTabClick('health')}
          className={cn(
            'hidden sm:flex items-center gap-1 transition-opacity hover:opacity-80',
            criticalCount > 0 ? 'text-red-600' : errorCount > 0 ? 'text-amber-600' : 'text-warm-500'
          )}
        >
          <span className="font-semibold tabular-nums">{errorCount}</span>
          <span>error{errorCount !== 1 ? 's' : ''} (7d)</span>
          {criticalCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium tabular-nums">
              {criticalCount} critical
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {lastRefresh && (
          <span className="text-warm-400 tabular-nums hidden sm:inline">
            Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {isRefreshing && (
          <IconRefresh size={12} className="text-primary-500 animate-spin" />
        )}
        <span className="text-warm-300 hidden md:inline">
          Auto-refresh 60s
        </span>
      </div>
    </div>
  );
}

// ============================================
// SPORT TOGGLE for Sport Operations tab
// ============================================
function SportToggle({ sport, onToggle }: { sport: 'golf' | 'baseball'; onToggle: (s: 'golf' | 'baseball') => void }) {
  return (
    <div className="flex gap-1 bg-white/50 backdrop-blur-sm rounded-lg p-0.5 border border-white/20">
      <button
        onClick={() => onToggle('golf')}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
          sport === 'golf'
            ? 'bg-white shadow-sm text-warm-900'
            : 'text-warm-500 hover:text-warm-700 hover:bg-white/40'
        )}
      >
        <span className="text-base">&#9971;</span>
        Golf
      </button>
      <button
        onClick={() => onToggle('baseball')}
        className={cn(
          'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
          sport === 'baseball'
            ? 'bg-white shadow-sm text-warm-900'
            : 'text-warm-500 hover:text-warm-700 hover:bg-white/40'
        )}
      >
        <span className="text-base">&#9918;</span>
        Baseball
      </button>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function AdminDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sportView, setSportView] = useState<'golf' | 'baseball'>('golf');
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // URL-driven tab state
  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === urlTab) ? urlTab! : 'command';

  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/golf/admin?${params.toString()}`, { scroll: false });
  }

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadData(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [loadData]);

  // Keyboard shortcuts: 1-6 to switch tabs, R to refresh
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const tabIndex = parseInt(e.key) - 1;
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        setActiveTab(TABS[tabIndex]!.id);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        loadData(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/golf/login');
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
                alt="Helm Sports Labs"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
                unoptimized
              />
              <div>
                <h1 className="text-lg font-bold text-warm-900">Command Center</h1>
                <p className="text-xs text-warm-400">Helm Sports Labs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
                  onClick={() => loadData(true)}
                  disabled={isRefreshing}
                  className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-white/50 transition-all disabled:opacity-50"
                  title="Refresh data (R)"
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

      {/* Persistent status bar + Tab navigation */}
      {data && !loading && (
        <div className="relative z-10 border-b border-white/20 bg-white/30 backdrop-blur-md sticky top-16">
          <div className="max-w-[1440px] mx-auto">
            {/* Status bar */}
            <StatusBar
              data={data}
              isRefreshing={isRefreshing}
              lastRefresh={lastRefresh}
              onTabClick={setActiveTab}
            />

            {/* Tab nav */}
            <div className="px-4 sm:px-6 lg:px-8 pb-2">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
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
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                      <span className="hidden lg:inline text-[10px] text-warm-300 ml-1">{tab.shortcut}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {/* TAB 1: COMMAND CENTER */}
              {/* ============================================ */}
              {activeTab === 'command' && (
                <>
                  {/* Top KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                    <AdminStatCard
                      label="Total Users"
                      value={data.users.totalCoaches + data.users.totalPlayers + data.users.totalAdmins + data.baseball.totalPlayers + data.baseball.totalCoaches}
                      icon={<IconUsers size={20} />}
                      trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
                      detail={`${data.users.newUsersThisWeek} new this week`}
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
                      label="AI Activity"
                      value={data.health.roundReviewsThisWeek + data.health.insightsThisWeek}
                      icon={<IconSparkles size={20} />}
                      detail={`${data.health.roundReviewsThisWeek} reviews, ${data.health.insightsThisWeek} insights`}
                      accentColor="green"
                    />
                    <AdminStatCard
                      label="Errors (7d)"
                      value={data.errorLogs.totalErrors7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.errorLogs.criticalErrors7d > 0 ? 'red' : data.errorLogs.totalErrors7d > 0 ? 'amber' : 'green'}
                      detail={data.errorLogs.criticalErrors7d > 0 ? `${data.errorLogs.criticalErrors7d} critical` : 'no critical'}
                    />
                    <AdminStatCard
                      label="Growth Rate"
                      value={`${data.growth.userGrowthRate > 0 ? '+' : ''}${data.growth.userGrowthRate}`}
                      suffix="%"
                      icon={<IconTrendingUp size={20} />}
                      accentColor={data.growth.userGrowthRate > 0 ? 'green' : data.growth.userGrowthRate < 0 ? 'red' : 'blue'}
                      detail="user growth vs last week"
                    />
                    <AdminStatCard
                      label="Health Score"
                      value={data.growth.platformHealthScore}
                      suffix="/100"
                      icon={<IconActivity size={20} />}
                      accentColor={data.growth.platformHealthScore >= 50 ? 'green' : 'red'}
                    />
                  </div>

                  {/* Needs Attention */}
                  <NeedsAttention items={data.needsAttention} />

                  {/* 30-Day Trends + Activity Feed */}
                  <DailyCharts
                    signupsByDay={data.signupsByDay}
                    visitsByDay={data.visitsByDay}
                  />

                  {/* Health + Activity + Users */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <PlatformHealthCard health={data.health} />
                    <ActivityFeed activity={data.activity} />
                    <UserBreakdownCard users={data.users} />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* TAB 2: USERS & ACTIVITY */}
              {/* ============================================ */}
              {activeTab === 'users' && (
                <>
                  <InsightCallout data={data} tab="visibility" />

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
                      detail={`${data.teamRosters.length} total teams`}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Coach Onboarding"
                      value={`${data.users.coachOnboardingRate}`}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      detail={`${data.users.totalCoaches} coaches`}
                      accentColor={data.users.coachOnboardingRate > 60 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Player Onboarding"
                      value={`${data.users.playerOnboardingRate}`}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      detail={`${data.users.totalPlayers} players`}
                      accentColor={data.users.playerOnboardingRate > 60 ? 'green' : 'amber'}
                    />
                  </div>

                  <TeamRosterCard teamRosters={data.teamRosters} />
                  <UserActivityTable users={data.userDirectory} />
                </>
              )}

              {/* ============================================ */}
              {/* TAB 3: HEALTH & ISSUES */}
              {/* ============================================ */}
              {activeTab === 'health' && (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard
                      label="Total Errors (7d)"
                      value={data.errorLogs.totalErrors7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.errorLogs.totalErrors7d > 10 ? 'red' : data.errorLogs.totalErrors7d > 0 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="Critical Errors"
                      value={data.errorLogs.criticalErrors7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.errorLogs.criticalErrors7d > 0 ? 'red' : 'green'}
                      detail={data.errorLogs.criticalErrors7d > 0 ? 'Immediate attention needed' : 'All clear'}
                    />
                    <AdminStatCard
                      label="Failed Logins (7d)"
                      value={data.loginSecurity.failedLogins7d}
                      icon={<IconShield size={20} />}
                      accentColor={data.loginSecurity.failedLogins7d > 5 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="Locked Accounts"
                      value={data.loginSecurity.lockedAccounts}
                      icon={<IconShield size={20} />}
                      accentColor={data.loginSecurity.lockedAccounts > 0 ? 'red' : 'green'}
                    />
                  </div>

                  {/* System Health Grid + Error Feed */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <HealthCheckGrid
                      health={data.health}
                      errorLogs={data.errorLogs}
                      loginSecurity={data.loginSecurity}
                    />
                    <ErrorFeed errorLogs={data.errorLogs} />
                  </div>

                  {/* CoachHelm AI Health */}
                  <CoachHelmHealthCard coachhelm={data.coachhelm} coachhelmRoi={data.coachhelmRoi} />
                </>
              )}

              {/* ============================================ */}
              {/* TAB 4: ANALYTICS & GROWTH */}
              {/* ============================================ */}
              {activeTab === 'analytics' && (
                <>
                  <InsightCallout data={data} tab="growth" />

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                    <AdminStatCard
                      label="Health Score"
                      value={data.growth.platformHealthScore}
                      suffix="/100"
                      icon={<IconActivity size={20} />}
                      accentColor={data.growth.platformHealthScore >= 50 ? 'green' : 'red'}
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
                      label="Weekly Active"
                      value={`${data.engagement.weeklyRetention}`}
                      suffix="%"
                      icon={<IconTrendingUp size={20} />}
                      accentColor={data.engagement.weeklyRetention > 30 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Stickiness"
                      value={`${data.stickiness.dauMauRatio}`}
                      suffix="%"
                      icon={<IconChart size={20} />}
                      detail={`DAU/MAU · ${data.stickiness.dau}/${data.stickiness.mau}`}
                      accentColor={data.stickiness.dauMauRatio > 20 ? 'green' : 'amber'}
                    />
                    <AdminStatCard
                      label="Churned (30d)"
                      value={data.growth.churnedPlayers30d}
                      icon={<IconWarning size={20} />}
                      detail="players went inactive"
                      accentColor={data.growth.churnedPlayers30d > 0 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="AI Adoption"
                      value={`${data.coachhelm.coachPhilosophyAdoption}`}
                      suffix="%"
                      icon={<IconSparkles size={20} />}
                      accentColor={data.coachhelm.coachPhilosophyAdoption > 50 ? 'green' : 'amber'}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GrowthCard
                      growth={data.growth}
                      users={data.users}
                      usage={data.usage}
                      coachhelm={data.coachhelm}
                      userJourney={data.userJourney}
                      stickiness={data.stickiness}
                    />
                    <EngagementCard
                      engagement={data.engagement}
                      totalPlayers={data.users.totalPlayers}
                      totalCoaches={data.users.totalCoaches}
                      playerEngagement={data.playerEngagement}
                      stickiness={data.stickiness}
                    />
                  </div>
                </>
              )}

              {/* ============================================ */}
              {/* TAB 5: SPORT OPERATIONS */}
              {/* ============================================ */}
              {activeTab === 'sports' && (
                <>
                  <SportToggle sport={sportView} onToggle={setSportView} />

                  {sportView === 'golf' ? (
                    <>
                      <InsightCallout data={data} tab="performance" />

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                        <AdminStatCard
                          label="Scoring Avg"
                          value={data.scoring.platformScoringAvg?.toFixed(1) ?? '\u2014'}
                          icon={<IconTarget size={20} />}
                          detail={`${data.usage.totalRounds.toLocaleString()} total rounds`}
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
                          label="Putts / Round"
                          value={data.scoring.platformPuttsPerRound?.toFixed(1) ?? '\u2014'}
                          icon={<IconTarget size={20} />}
                          accentColor="blue"
                        />
                        <AdminStatCard
                          label="Total Shots"
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

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <ScoringIntelligenceCard scoring={data.scoring} />
                        <TeamIntelligenceCard teams={data.teams} />
                        <UsageMetricsCard usage={data.usage} dataQuality={data.dataQuality} funnel={data.funnel} />
                      </div>
                    </>
                  ) : (
                    <BaseballOps baseball={data.baseball} />
                  )}
                </>
              )}

              {/* ============================================ */}
              {/* TAB 6: AUDIT & SECURITY */}
              {/* ============================================ */}
              {activeTab === 'audit' && (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <AdminStatCard
                      label="Audit Events (7d)"
                      value={data.auditLog.totalEvents7d}
                      icon={<IconShield size={20} />}
                      accentColor="blue"
                    />
                    <AdminStatCard
                      label="Failed Logins (7d)"
                      value={data.loginSecurity.failedLogins7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.loginSecurity.failedLogins7d > 5 ? 'amber' : 'green'}
                    />
                    <AdminStatCard
                      label="Locked Accounts"
                      value={data.loginSecurity.lockedAccounts}
                      icon={<IconShield size={20} />}
                      accentColor={data.loginSecurity.lockedAccounts > 0 ? 'red' : 'green'}
                    />
                    <AdminStatCard
                      label="Total Errors (7d)"
                      value={data.errorLogs.totalErrors7d}
                      icon={<IconWarning size={20} />}
                      accentColor={data.errorLogs.totalErrors7d > 0 ? 'amber' : 'green'}
                    />
                  </div>

                  <AuditFeed
                    auditLog={data.auditLog}
                    loginSecurity={data.loginSecurity}
                  />
                </>
              )}

            </motion.div>
          </AnimatePresence>
        ) : null}
      </main>
    </div>
  );
}
