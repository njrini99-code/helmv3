'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
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
import CoachIntelligenceCard from './components/CoachIntelligenceCard';
import CohortRetentionMatrix from './components/CohortRetentionMatrix';
import ComparativeBenchmarks from './components/ComparativeBenchmarks';
import DataFreshnessAlerts from './components/DataFreshnessAlerts';
import InfraHealthCard from './components/InfraHealthCard';
import PlayerDropoffFunnel from './components/PlayerDropoffFunnel';
import SessionHeatmap from './components/SessionHeatmap';
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking';
import {
  IconHome,
  IconUsers,
  IconActivity,
  IconChart,
  IconTarget,
  IconRefresh,
  IconLogOut,
  IconChevronLeft,
  IconChevronRight,
  IconMenu,
  IconX,
  IconWarning,
  IconTrendingUp,
  IconSparkles,
} from '@/components/icons';

// Real-time components
import { AdminRealtimeProvider, useAdminRealtimeContext } from './components/AdminRealtimeProvider';
import { AdminOnlineIndicator } from './components/AdminOnlineIndicator';
import { LiveEventCounter, LiveEventBadge } from './components/LiveEventCounter';
import { 
  AdminErrorBoundary, 
  CardErrorBoundary as _CardErrorBoundary, // Available for wrapping individual cards
  StatSkeleton as ImprovedStatSkeleton, 
  CardSkeleton as ImprovedCardSkeleton 
} from './components/AdminErrorBoundary';

// CRM Stats type
interface CRMStats {
  total: number;
  newLeads: number;
  contacted: number;
  demosScheduled: number;
  customers: number;
}

// ============================================================================
// TAB DEFINITIONS — 4 consolidated tabs with Lucide icons
// ============================================================================
const TABS = [
  { 
    id: 'command', 
    label: 'Command', 
    Icon: IconHome, 
    shortcut: '1',
    description: 'Overview dashboard'
  },
  { 
    id: 'users', 
    label: 'Users', 
    Icon: IconUsers, 
    shortcut: '2',
    description: 'User & team management'
  },
  { 
    id: 'health', 
    label: 'Health', 
    Icon: IconActivity, 
    shortcut: '3',
    description: 'System health & errors'
  },
  { 
    id: 'analytics', 
    label: 'Analytics', 
    Icon: IconChart, 
    shortcut: '4',
    description: 'Growth & engagement'
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AUTO_REFRESH_INTERVAL = 60000;

// ============================================================================
// SKELETON LOADERS (use improved versions from AdminErrorBoundary)
// ============================================================================
const StatSkeleton = ImprovedStatSkeleton;
const CardSkeleton = ImprovedCardSkeleton;

// ============================================================================
// MAIN PAGE WRAPPER (with real-time provider)
// ============================================================================
export default function AdminDashboardPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'command') as string;
  
  // Get current user ID for presence
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  return (
    <AdminRealtimeProvider currentUserId={currentUserId} currentTab={activeTab}>
      <AdminErrorBoundary title="Dashboard Error" size="lg">
        <AdminDashboardContent />
      </AdminErrorBoundary>
    </AdminRealtimeProvider>
  );
}

// ============================================================================
// MAIN PAGE CONTENT
// ============================================================================
function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [crmStats, setCrmStats] = useState<CRMStats | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const { trackFeature } = useAnalyticsTracking();
  
  // Real-time context
  const { realtime, presence, alerts } = useAdminRealtimeContext();

  // URL-driven tab state
  const urlTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = TABS.some((t) => t.id === urlTab) ? urlTab! : 'command';

  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/golf/admin?${params.toString()}`, { scroll: false });
    trackFeature('tab_switch', { tab });
    setMobileMenuOpen(false);
  }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const result = await getAdminDashboardData();
      setData(result);
      setLastRefresh(new Date());
      setError(null);
      
      // Also fetch CRM stats
      const supabase = createClient();
      const { data: crmData } = await supabase
        .from('crm_coaches')
        .select('status');
      
      if (crmData) {
        const stats: CRMStats = {
          total: crmData.length,
          newLeads: crmData.filter(c => c.status === 'new_lead').length,
          contacted: crmData.filter(c => c.status === 'contacted').length,
          demosScheduled: crmData.filter(c => c.status === 'demo_scheduled').length,
          customers: crmData.filter(c => c.status === 'customer').length,
        };
        setCrmStats(stats);
      }
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

  // Keyboard shortcuts: 1-4 to switch tabs, R to refresh
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

  // Computed stats for sidebar
  const quickStats = data ? {
    totalUsers: data.totalPlatformUsers,
    activeNow: data.health.realActiveUsers1h,
    errors7d: data.errorLogs.totalErrors7d,
    healthScore: data.growth.platformHealthScore,
  } : null;

  const overallHealth = data?.health.diagnostics.some((d) => d.status === 'critical')
    ? 'critical'
    : data?.health.diagnostics.some((d) => d.status === 'warning')
      ? 'warning'
      : 'healthy';

  return (
    <div className="min-h-screen bg-[#FFFEF8] flex">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Fixed position */}
      <aside className={cn(
        'fixed left-0 top-0 bottom-0 z-50',
        'flex flex-col',
        'bg-[#1C1917]',
        'border-r border-white/5',
        'transition-all duration-300 ease-in-out',
        sidebarCollapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden lg:flex'
      )}>
        {/* Sidebar Header */}
        <div className={cn('flex items-center gap-3 px-4 h-16', sidebarCollapsed && 'justify-center px-0')}>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Image
              src="/helm-golf-logo-transparent.png"
              alt="Helm"
              width={24}
              height={24}
              className="w-6 h-6 object-contain"
              unoptimized
            />
          </div>
          {!sidebarCollapsed && (
            <span className="font-bold text-lg text-white tracking-tight">Command</span>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;
              const showBadge = tab.id === 'health' && alerts.unreadCount > 0;
              const badgeCount = alerts.unreadCount;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'group relative flex items-center gap-3 w-full rounded-[10px] transition-colors duration-200',
                    sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                    isActive ? 'bg-white/10 text-white' : 'text-warm-400 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />
                  )}
                  <TabIcon 
                    size={20}
                    className={cn(
                      'flex-shrink-0 transition-colors duration-200',
                      isActive ? 'text-primary-400' : 'text-warm-400 group-hover:text-white'
                    )} 
                  />
                  {!sidebarCollapsed && (
                    <span className="text-sm font-medium flex-1 text-left">{tab.label}</span>
                  )}
                  {!sidebarCollapsed && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono',
                      isActive ? 'bg-white/10 text-warm-300' : 'bg-white/5 text-warm-500'
                    )}>
                      {tab.shortcut}
                    </span>
                  )}
                  {showBadge && (
                    <span className={cn(
                      'flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full',
                      sidebarCollapsed && 'absolute -top-1 -right-1'
                    )}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-warm-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                      {tab.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* CRM Button */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <Link
              href="/golf/admin/crm"
              className={cn(
                'group relative flex items-center gap-3 w-full rounded-[10px] transition-colors duration-200',
                sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                'text-primary-400 hover:bg-white/5 hover:text-primary-300'
              )}
            >
              <IconTarget className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">Coach CRM</div>
                    <div className="text-[11px] text-warm-500">
                      {crmStats ? `${crmStats.total} coaches` : 'Sales pipeline'}
                    </div>
                  </div>
                  <span className="text-warm-500 group-hover:text-primary-400">→</span>
                </>
              )}
              {sidebarCollapsed && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-warm-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                  Coach CRM
                </div>
              )}
            </Link>
          </div>
        </nav>

        {/* Quick Stats in Sidebar */}
        {!sidebarCollapsed && quickStats && (
          <div className="p-3 border-t border-white/10 space-y-3">
            <div className="text-[11px] font-semibold text-warm-500 uppercase tracking-wider px-1">
              Quick Stats
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] p-3 bg-white/5 border border-white/5">
                <div className="text-xl font-bold text-white tabular-nums">{quickStats.totalUsers}</div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">Total Users</div>
              </div>
              <div className="rounded-[10px] p-3 bg-white/5 border border-white/5">
                <div className="text-xl font-bold text-white tabular-nums">
                  {quickStats.activeNow > 0 ? quickStats.activeNow : <span className="text-warm-500">—</span>}
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">Active Now</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn(
                'rounded-[10px] p-3 bg-white/5 border border-white/5',
                quickStats.errors7d > 0 && 'border-l-2 border-l-amber-500'
              )}>
                <div className={cn(
                  'text-xl font-bold tabular-nums',
                  quickStats.errors7d > 0 ? 'text-amber-400' : 'text-white'
                )}>
                  {quickStats.errors7d > 0 ? quickStats.errors7d : <span className="text-warm-500">—</span>}
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">
                  {quickStats.errors7d === 0 ? 'No Errors' : 'Errors (7d)'}
                </div>
              </div>
              <div className={cn(
                'rounded-[10px] p-3 bg-white/5 border border-white/5',
                overallHealth !== 'healthy' && 'border-l-2',
                overallHealth === 'warning' && 'border-l-amber-500',
                overallHealth === 'critical' && 'border-l-red-500'
              )}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    overallHealth === 'healthy' ? 'bg-primary-500' : overallHealth === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                  )} />
                  <span className={cn(
                    'text-sm font-semibold',
                    overallHealth === 'healthy' ? 'text-white' : overallHealth === 'warning' ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {overallHealth === 'healthy' ? 'Healthy' : overallHealth === 'warning' ? 'Warning' : 'Critical'}
                  </span>
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-1">
                  System Health
                </div>
              </div>
            </div>
            
            {/* Connection Status - simplified, no animation */}
            <div className="rounded-[10px] p-2.5 flex items-center justify-between bg-white/5 border border-white/5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  realtime.isConnected ? 'bg-primary-500' : 'bg-amber-500'
                )} />
                <span className={cn(
                  'text-xs font-medium',
                  realtime.isConnected ? 'text-warm-400' : 'text-amber-400'
                )}>
                  {realtime.isConnected ? 'Live' : 'Connecting'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#1C1917] border border-white/20 flex items-center justify-center text-warm-400 hover:text-white transition-colors shadow-lg"
        >
          {sidebarCollapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 bottom-0 z-50 w-[260px]',
        'flex flex-col bg-[#1C1917] border-r border-white/5',
        'transition-transform duration-300 ease-in-out lg:hidden',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <Image src="/helm-golf-logo-transparent.png" alt="Helm" width={24} height={24} className="w-6 h-6" unoptimized />
            </div>
            <span className="font-bold text-lg text-white">Command</span>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-warm-400 hover:text-white">
            <IconX size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const TabIcon = tab.Icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-warm-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <TabIcon size={20} className={cn(isActive && 'text-primary-400')} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
          <Link href="/golf/admin/crm" className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-primary-400 hover:bg-white/5 mt-4 pt-4 border-t border-white/10">
            <IconTarget size={20} />
            <span className="text-sm font-medium">Coach CRM</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content - with margin for fixed sidebar */}
      <main className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
      )}>
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#FFFEF8]/95 backdrop-blur-sm border-b border-warm-200/50 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setMobileMenuOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg text-warm-600 hover:bg-warm-100">
              <IconMenu size={20} />
            </button>

            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-warm-400 tabular-nums hidden md:block">
                  Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className={cn(
                  'p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100 transition-colors',
                  isRefreshing && 'animate-spin'
                )}
                title="Refresh (R)"
              >
                <IconRefresh size={16} />
              </button>

              <Link
                href="/golf/admin/crm"
                className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors"
              >
                <IconTarget size={16} />
                <span className="hidden sm:inline">CRM</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100 transition-colors"
                title="Sign Out"
              >
                <IconLogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
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
            <div className="space-y-6">
              {/* ============================================ */}
              {/* TAB 1: COMMAND - Overview Dashboard */}
              {/* ============================================ */}
              {activeTab === 'command' && (
                <div className="space-y-6">
                  {/* Top KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
                    <AdminStatCard
                      label="Total Users"
                      value={data.totalPlatformUsers}
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

                    {/* 30-Day Trends */}
                    <DailyCharts
                      signupsByDay={data.signupsByDay}
                      visitsByDay={data.visitsByDay}
                    />

                    {/* Health + Activity + Users */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                      <PlatformHealthCard health={data.health} />
                      <ActivityFeed activity={data.activity} />
                      <UserBreakdownCard users={data.users} />
                    </div>
                  </div>
                )}

                {/* ============================================ */}
                {/* TAB 2: USERS - User & Team Management */}
                {/* ============================================ */}
                {activeTab === 'users' && (
                  <div className="space-y-6">
                    <InsightCallout data={data} tab="visibility" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <AdminStatCard
                        label="Total Users"
                        value={data.totalPlatformUsers}
                        icon={<IconUsers size={20} />}
                        trend={{ value: data.growth.userGrowthRate, label: 'vs last week' }}
                        detail={`${data.users.totalCoaches} coaches · ${data.users.totalPlayers} players · ${data.users.totalAdmins} admin`}
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

                    <CoachIntelligenceCard coaches={data.coachIntelligence} />
                    <PlayerDropoffFunnel funnel={data.playerFunnel.funnel} stuckUsers={data.playerFunnel.stuckUsers} />
                    <DataFreshnessAlerts
                      churnRiskPlayers={data.freshnessAlerts.churnRiskPlayers}
                      inactiveTeams={data.freshnessAlerts.inactiveTeams}
                      disengagedCoaches={data.freshnessAlerts.disengagedCoaches}
                    />
                    <TeamRosterCard teamRosters={data.teamRosters} />
                    <UserActivityTable users={data.userDirectory} />
                  </div>
                )}

                {/* ============================================ */}
                {/* TAB 3: HEALTH - System Health & Errors */}
                {/* ============================================ */}
                {activeTab === 'health' && (
                  <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                        icon={<IconActivity size={20} />}
                        accentColor={data.loginSecurity.failedLogins7d > 5 ? 'amber' : 'green'}
                      />
                      <AdminStatCard
                        label="Locked Accounts"
                        value={data.loginSecurity.lockedAccounts}
                        icon={<IconActivity size={20} />}
                        accentColor={data.loginSecurity.lockedAccounts > 0 ? 'red' : 'green'}
                      />
                    </div>

                    {/* System Health Grid + Error Feed */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                      <HealthCheckGrid
                        health={data.health}
                        errorLogs={data.errorLogs}
                        loginSecurity={data.loginSecurity}
                      />
                      <ErrorFeed errorLogs={data.errorLogs} />
                    </div>

                    {/* CoachHelm AI Health */}
                    <CoachHelmHealthCard coachhelm={data.coachhelm} coachhelmRoi={data.coachhelmRoi} />

                    {/* Infrastructure Health */}
                    <InfraHealthCard
                      apiPerf={data.infraHealth.apiPerf}
                      clientErrors={data.infraHealth.clientErrors}
                      dbHealth={data.infraHealth.dbHealth}
                      totals={data.infraHealth.totals}
                    />
                  </div>
                )}

                {/* ============================================ */}
                {/* TAB 4: ANALYTICS - Growth, Engagement & Golf Stats */}
                {/* ============================================ */}
                {activeTab === 'analytics' && (
                  <div className="space-y-6">
                    <InsightCallout data={data} tab="growth" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
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

                    <CohortRetentionMatrix cohorts={data.cohortMatrix} />

                    <SessionHeatmap
                      pageViews={data.sessionHeatmap.pageViews}
                      featureUsage={data.sessionHeatmap.featureUsage}
                      sessionStats={data.sessionHeatmap.sessionStats}
                      deadFeatures={data.sessionHeatmap.deadFeatures}
                    />

                    {/* Golf Performance Metrics */}
                    <div className={cn(
                      'relative overflow-hidden',
                      'bg-white/65 backdrop-blur-[16px]',
                      'border border-white/30 rounded-2xl',
                      'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
                      'p-5 md:p-6'
                    )}>
                      <h3 className="text-[11px] md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <span>⛳</span> Golf Performance Overview
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.scoring.platformScoringAvg?.toFixed(1) ?? <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Scoring Avg</p>
                        </div>
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.scoring.platformFairwayPct != null ? `${data.scoring.platformFairwayPct.toFixed(0)}%` : <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Fairway %</p>
                        </div>
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.scoring.platformGirPct != null ? `${data.scoring.platformGirPct.toFixed(0)}%` : <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">GIR %</p>
                        </div>
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.scoring.platformPuttsPerRound?.toFixed(1) ?? <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Putts / Round</p>
                        </div>
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.usage.totalRounds > 0 ? data.usage.totalRounds.toLocaleString() : <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Total Rounds</p>
                        </div>
                        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                          <p className="text-2xl font-bold text-warm-900 tabular-nums">
                            {data.usage.totalShots > 0 ? data.usage.totalShots.toLocaleString() : <span className="text-warm-400">—</span>}
                          </p>
                          <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Total Shots</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                      <ScoringIntelligenceCard scoring={data.scoring} />
                      <TeamIntelligenceCard teams={data.teams} />
                      <UsageMetricsCard usage={data.usage} dataQuality={data.dataQuality} funnel={data.funnel} />
                    </div>

                    <ComparativeBenchmarks
                      teamComparisons={data.benchmarks.teamComparisons}
                      playerTrends={data.benchmarks.playerTrends}
                      aiCorrelation={data.benchmarks.aiCorrelation}
                    />

                    {/* Strokes Gained + Communication */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                      {/* Strokes Gained Averages */}
                      {data.strokesGained.sgTotal != null && (
                        <div className={cn(
                          'relative overflow-hidden',
                          'bg-white/65 backdrop-blur-[16px]',
                          'border border-white/30 rounded-2xl',
                          'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
                          'p-5 md:p-6'
                        )}>
                          <h3 className="text-[11px] md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-4">Platform Strokes Gained</h3>
                          <div className="space-y-3">
                            {[
                              { label: 'Total', value: data.strokesGained.sgTotal, color: '#16A34A' },
                              { label: 'Off the Tee', value: data.strokesGained.sgTee, color: '#2563EB' },
                              { label: 'Approach', value: data.strokesGained.sgApproach, color: '#8B5CF6' },
                              { label: 'Around Green', value: data.strokesGained.sgAroundGreen, color: '#F59E0B' },
                              { label: 'Putting', value: data.strokesGained.sgPutting, color: '#EF4444' },
                            ].map((sg) => (
                              <div key={sg.label} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sg.color }} />
                                  <span className="text-sm text-warm-600">{sg.label}</span>
                                </div>
                                <span className={cn(
                                  'text-sm font-semibold tabular-nums',
                                  sg.value != null && sg.value > 0 ? 'text-primary-600' : 
                                  sg.value != null && sg.value < 0 ? 'text-red-600' : 'text-warm-400'
                                )}>
                                  {sg.value != null ? (sg.value > 0 ? `+${sg.value.toFixed(2)}` : sg.value.toFixed(2)) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-warm-400 mt-4">Average across all players with strokes gained data</p>
                        </div>
                      )}

                      {/* Communication Metrics */}
                      <div className={cn(
                        'relative overflow-hidden',
                        'bg-white/65 backdrop-blur-[16px]',
                        'border border-white/30 rounded-2xl',
                        'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
                        'p-5 md:p-6'
                      )}>
                        <h3 className="text-[11px] md:text-xs font-medium text-warm-400 uppercase tracking-wider mb-4">Communication</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-white/50 rounded-xl p-3.5 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                            <p className="text-xl font-bold text-warm-900 tabular-nums">
                              {data.golfCommunication.totalAnnouncements > 0 ? data.golfCommunication.totalAnnouncements : <span className="text-warm-400">—</span>}
                            </p>
                            <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Announcements</p>
                          </div>
                          <div className="bg-white/50 rounded-xl p-3.5 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                            <p className="text-xl font-bold text-warm-900 tabular-nums">
                              {data.golfCommunication.totalGolfMessages > 0 ? data.golfCommunication.totalGolfMessages : <span className="text-warm-400">—</span>}
                            </p>
                            <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Messages</p>
                          </div>
                          <div className="bg-white/50 rounded-xl p-3.5 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                            <p className="text-xl font-bold text-warm-900 tabular-nums">
                              {data.golfCommunication.totalConversations > 0 ? data.golfCommunication.totalConversations : <span className="text-warm-400">—</span>}
                            </p>
                            <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Conversations</p>
                          </div>
                          <div className="bg-white/50 rounded-xl p-3.5 text-center border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                            <p className="text-xl font-bold text-warm-900 tabular-nums">
                              {data.golfCommunication.announcementAckRate != null ? data.golfCommunication.announcementAckRate : <span className="text-warm-400">—</span>}
                            </p>
                            <p className="text-[11px] text-warm-400 font-medium uppercase tracking-wider mt-1">Avg Acks</p>
                          </div>
                        </div>
                        {data.demoRequests.total > 0 && (
                          <div className="pt-4 border-t border-white/20">
                            <span className="text-[10px] text-warm-400 uppercase tracking-wider font-medium">Demo Requests</span>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-sm text-warm-700"><span className="font-semibold tabular-nums">{data.demoRequests.total}</span> total</span>
                              {data.demoRequests.pending > 0 && (
                                <span className="text-sm text-amber-600"><span className="font-semibold tabular-nums">{data.demoRequests.pending}</span> pending</span>
                              )}
                              <span className="text-sm text-primary-600"><span className="font-semibold tabular-nums">{data.demoRequests.contacted}</span> contacted</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
