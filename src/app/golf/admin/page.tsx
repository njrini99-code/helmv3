'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAdminDashboardData } from '@/app/golf/actions/admin-data';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking';
import {
  LayoutDashboard,
  Users,
  Cpu,
  TrendingUp,
  Target,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

// Tab components
import { OverviewTab } from './components/OverviewTab';
import { PeopleTab } from './components/PeopleTab';
import { SystemTab } from './components/SystemTab';
import { GrowthTab } from './components/GrowthTab';

// Real-time components
import { AdminRealtimeProvider, useAdminRealtimeContext } from './components/AdminRealtimeProvider';
import {
  AdminErrorBoundary,
  StatSkeleton as ImprovedStatSkeleton,
  CardSkeleton as ImprovedCardSkeleton,
} from './components/AdminErrorBoundary';

// CRM Stats type
interface CRMStats {
  total: number;
  newLeads: number;
  inPipeline: number;
  demosScheduled: number;
  customers: number;
}

// ============================================================================
// TAB DEFINITIONS — 4 tabs with renamed labels per UI spec
// ============================================================================
const TABS = [
  {
    id: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    shortcut: '1',
    description: 'Overview dashboard',
  },
  {
    id: 'people',
    label: 'People',
    Icon: Users,
    shortcut: '2',
    description: 'User & team management',
  },
  {
    id: 'system',
    label: 'System',
    Icon: Cpu,
    shortcut: '3',
    description: 'System health & errors',
  },
  {
    id: 'growth',
    label: 'Growth',
    Icon: TrendingUp,
    shortcut: '4',
    description: 'Growth & engagement',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AUTO_REFRESH_INTERVAL = 60000;

// Skeleton loaders
const StatSkeleton = ImprovedStatSkeleton;
const CardSkeleton = ImprovedCardSkeleton;

// ============================================================================
// MAIN PAGE WRAPPER (with real-time provider)
// ============================================================================
export default function AdminDashboardPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'overview') as string;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null);
      })
      .catch((err) => {
        console.error('Failed to get user:', err);
        setCurrentUserId(null);
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

  const { realtime, alerts } = useAdminRealtimeContext();

  // Map old tab IDs to new ones for backward compat
  const urlTab = searchParams.get('tab') as string | null;
  const tabMapping: Record<string, TabId> = {
    command: 'overview',
    users: 'people',
    health: 'system',
    analytics: 'growth',
    overview: 'overview',
    people: 'people',
    system: 'system',
    growth: 'growth',
  };
  const activeTab: TabId = tabMapping[urlTab ?? ''] ?? 'overview';

  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/golf/admin?${params.toString()}`, { scroll: false });
    trackFeature('tab_switch', { tab });
    setMobileMenuOpen(false);
  }

  function handleNavigateTab(tabHint: string) {
    const mapped = tabMapping[tabHint];
    if (mapped) setActiveTab(mapped);
  }

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const result = await getAdminDashboardData();
      setData(result);
      setLastRefresh(new Date());
      setError(null);

      const supabase = createClient();
      const { data: crmData } = await supabase.from('crm_coaches').select('status');

      if (crmData) {
        const stats: CRMStats = {
          total: crmData.length,
          newLeads: crmData.filter((c) => c.status === 'new_lead').length,
          inPipeline: crmData.filter((c) =>
            ['initial_contact', 'follow_up', 'engaged', 'negotiating'].includes(c.status)
          ).length,
          demosScheduled: crmData.filter(
            (c) => c.status === 'demo_scheduled' || c.status === 'demo_completed'
          ).length,
          customers: crmData.filter((c) => c.status === 'closed_won').length,
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

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      loadData(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [loadData]);

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

  const quickStats = data
    ? {
        totalUsers: data.totalPlatformUsers,
        activeNow: data.health.realActiveUsers1h,
        errors7d: data.errorLogs.totalErrors7d,
        healthScore: data.growth.platformHealthScore,
      }
    : null;

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
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Fixed position */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-50',
          'flex flex-col',
          'bg-[#1C1917]',
          'border-r border-white/5',
          'transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]',
          'hidden lg:flex'
        )}
      >
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
            <span className="font-bold text-lg text-white tracking-tight">Admin</span>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;
              const showBadge = tab.id === 'system' && alerts.unreadCount > 0;
              const badgeCount = alerts.unreadCount;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'group relative flex items-center gap-3 w-full rounded-[10px] transition-colors duration-200',
                    sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-warm-400 hover:bg-white/5 hover:text-white'
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
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono',
                        isActive ? 'bg-white/10 text-warm-300' : 'bg-white/5 text-warm-500'
                      )}
                    >
                      {tab.shortcut}
                    </span>
                  )}
                  {showBadge && (
                    <span
                      className={cn(
                        'flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full',
                        sidebarCollapsed && 'absolute -top-1 -right-1'
                      )}
                    >
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
              <Target size={20} className="flex-shrink-0" />
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
                <div className="text-xl font-bold text-white tabular-nums">
                  {quickStats.totalUsers}
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">
                  Total Users
                </div>
              </div>
              <div className="rounded-[10px] p-3 bg-white/5 border border-white/5">
                <div className="text-xl font-bold text-white tabular-nums">
                  {quickStats.activeNow > 0 ? (
                    quickStats.activeNow
                  ) : (
                    <span className="text-warm-500">—</span>
                  )}
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">
                  Active Now
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={cn(
                  'rounded-[10px] p-3 bg-white/5 border border-white/5',
                  quickStats.errors7d > 0 && 'border-l-2 border-l-amber-500'
                )}
              >
                <div
                  className={cn(
                    'text-xl font-bold tabular-nums',
                    quickStats.errors7d > 0 ? 'text-amber-400' : 'text-white'
                  )}
                >
                  {quickStats.errors7d > 0 ? (
                    quickStats.errors7d
                  ) : (
                    <span className="text-warm-500">—</span>
                  )}
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">
                  {quickStats.errors7d === 0 ? 'No Errors' : 'Errors (7d)'}
                </div>
              </div>
              <div
                className={cn(
                  'rounded-[10px] p-3 bg-white/5 border border-white/5',
                  overallHealth !== 'healthy' && 'border-l-2',
                  overallHealth === 'warning' && 'border-l-amber-500',
                  overallHealth === 'critical' && 'border-l-red-500'
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      overallHealth === 'healthy'
                        ? 'bg-primary-500'
                        : overallHealth === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      overallHealth === 'healthy'
                        ? 'text-white'
                        : overallHealth === 'warning'
                          ? 'text-amber-400'
                          : 'text-red-400'
                    )}
                  >
                    {overallHealth === 'healthy'
                      ? 'Healthy'
                      : overallHealth === 'warning'
                        ? 'Warning'
                        : 'Critical'}
                  </span>
                </div>
                <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-1">
                  System Health
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className="rounded-[10px] p-2.5 flex items-center justify-between bg-white/5 border border-white/5">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    realtime.isConnected ? 'bg-primary-500' : 'bg-amber-500'
                  )}
                />
                <span
                  className={cn(
                    'text-xs font-medium',
                    realtime.isConnected ? 'text-warm-400' : 'text-amber-400'
                  )}
                >
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
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-50 w-[260px]',
          'flex flex-col bg-[#1C1917] border-r border-white/5',
          'transition-transform duration-300 ease-in-out lg:hidden',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="Helm"
                width={24}
                height={24}
                className="w-6 h-6"
                unoptimized
              />
            </div>
            <span className="font-bold text-lg text-white">Admin</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 text-warm-400 hover:text-white transition-colors"
          >
            <X size={20} />
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
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-warm-400 hover:bg-white/5 hover:text-white'
                )}
              >
                <TabIcon size={20} className={cn(isActive && 'text-primary-400')} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}
          <Link
            href="/golf/admin/crm"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-primary-400 hover:bg-white/5 transition-colors mt-4 pt-4 border-t border-white/10"
          >
            <Target size={20} />
            <span className="text-sm font-medium">Coach CRM</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content - with margin for fixed sidebar */}
      <main
        className={cn(
          'flex-1 flex flex-col min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'
        )}
      >
        {/* Top Bar */}
        <header
          className={cn(
            'sticky top-0 z-30',
            'bg-white/70 backdrop-blur-xl',
            'border-b border-warm-200/40',
            'px-4 sm:px-6 py-3'
          )}
        >
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/80 active:bg-warm-200 transition-colors"
            >
              <Menu size={22} />
            </button>

            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-warm-400 tabular-nums hidden md:block">
                  Updated{' '}
                  {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className={cn(
                  'p-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/80 active:bg-warm-200 transition-colors',
                  isRefreshing && 'animate-spin'
                )}
                title="Refresh (R)"
              >
                <RefreshCw size={18} />
              </button>

              <Link
                href="/golf/admin/crm"
                className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors"
              >
                <Target size={16} />
                <span className="hidden sm:inline">CRM</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="p-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/80 active:bg-warm-200 transition-colors"
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <div
              className={cn(
                'bg-white/70 backdrop-blur-xl border border-red-200/50 rounded-2xl shadow-glass p-6 text-center'
              )}
            >
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
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
              {activeTab === 'overview' && (
                <OverviewTab data={data} onNavigateTab={handleNavigateTab} />
              )}
              {activeTab === 'people' && <PeopleTab data={data} />}
              {activeTab === 'system' && <SystemTab data={data} />}
              {activeTab === 'growth' && <GrowthTab data={data} />}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
