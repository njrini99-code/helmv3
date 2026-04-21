'use client';

import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getAdminDashboardData } from '@/app/golf/actions/admin-data';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';
import {
  IconUsers,
  IconTarget,
  IconRefresh,
  IconChevronRight,
  IconX,
  IconChartBar,
  IconLayoutGrid as LayoutDashboard,
  IconBrain as Cpu,
  IconCrosshair as Crosshair,
  IconLogOut as LogOut,
  IconChevronLeft as ChevronLeft,
  IconMenu as Menu,
} from '@/components/icons';

// Tab components — lazy loaded for faster initial render
import { OverviewTab } from './components/OverviewTab';
const PeopleTab = lazy(() => import('./components/PeopleTab').then(m => ({ default: m.PeopleTab })));
const SystemTab = lazy(() => import('./components/SystemTab').then(m => ({ default: m.SystemTab })));
const BusinessIntelligenceTab = lazy(() => import('./components/BusinessIntelligenceTab').then(m => ({ default: m.BusinessIntelligenceTab })));
const TracerTab = lazy(() => import('./components/TracerTab').then(m => ({ default: m.TracerTab })));

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
    Icon: IconUsers,
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
    id: 'bi',
    label: 'Intelligence',
    Icon: IconChartBar,
    shortcut: '4',
    description: 'Business Intelligence',
  },
  {
    id: 'tracer',
    label: 'Tracer',
    Icon: Crosshair,
    shortcut: '5',
    description: 'Shot tracking & error tracing',
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

// Realtime pushes incremental updates; this is a safety-net refresh that
// only fires while the tab is visible.
const AUTO_REFRESH_INTERVAL = 300_000; // 5 minutes

// Skeleton loaders
const StatSkeleton = ImprovedStatSkeleton;
const CardSkeleton = ImprovedCardSkeleton;

function TabLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

function AdminBrand({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="w-14 h-14 flex items-center justify-center">
        <Image
          src="/helm-golf-logo-transparent.png"
          alt="GolfHelm"
          width={56}
          height={56}
          className="w-14 h-14 object-contain"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-14 h-14 flex items-center justify-center flex-shrink-0">
        <Image
          src="/helm-golf-logo-transparent.png"
          alt="GolfHelm"
          width={56}
          height={56}
          className="w-14 h-14 object-contain"
          priority
          unoptimized
        />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none tracking-tight text-white">
          Golf<span className="text-primary-400">Helm</span>
        </div>
        <div className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">
          Admin
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE WRAPPER (with real-time provider)
// ============================================================================
export default function AdminDashboardPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'overview') as string;
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setCurrentUserId(data.user?.id ?? null);
      })
      .catch(() => {
        setCurrentUserId(null);
      });
  }, [supabase]);

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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [crmStats, setCrmStats] = useState<CRMStats | null>(null);
  const { trackFeature } = useAnalyticsTracking();
  const supabase = useMemo(() => createClient(), []);

  const { realtime, alerts } = useAdminRealtimeContext();

  // Map old tab IDs to new ones for backward compat
  const urlTab = searchParams.get('tab') as string | null;
  const tabMapping: Record<string, TabId> = {
    command: 'overview',
    users: 'people',
    health: 'system',
    analytics: 'bi',
    overview: 'overview',
    people: 'people',
    system: 'system',
    growth: 'bi',
    bi: 'bi',
    tracer: 'tracer',
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
    // If session is already known to be expired, don't retry
    if (sessionExpired) return;

    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      // Fetch main data and CRM data in parallel
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const [result, crmResult] = await Promise.all([
        getAdminDashboardData(),
        supabase.from('crm_coaches').select('status').gte('created_at', ninetyDaysAgo),
      ]);

      setData(result);
      setLastRefresh(new Date());
      setError(null);

      const crmData = crmResult.data;
      if (crmData) {
        const stats: CRMStats = {
          total: crmData.length,
          newLeads: crmData.filter((c) => c.status === 'new_lead').length,
          inPipeline: crmData.filter((c) =>
            ['contacted', 'engaged', 'proposal', 'nurture'].includes(c.status as string)
          ).length,
          demosScheduled: crmData.filter(
            (c) => (c.status as string) === 'proposal'
          ).length,
          customers: crmData.filter((c) => c.status === 'won').length,
        };
        setCrmStats(stats);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard';

      // If the error is auth-related, stop polling and show session expired UI.
      // Flipping sessionExpired=true passes null to useVisibilityAwareInterval
      // below, which tears the timer down.
      if (message === 'Unauthorized' || message === 'Forbidden') {
        setSessionExpired(true);
        if (!silent) {
          setError(message);
        }
        return;
      }

      if (!silent) {
        setError(message);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [sessionExpired, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshTick = useCallback(() => {
    loadData(true);
  }, [loadData]);
  // Pauses while tab is hidden; disables entirely when session is expired.
  useVisibilityAwareInterval(
    refreshTick,
    sessionExpired ? null : AUTO_REFRESH_INTERVAL,
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tabIndex = parseInt(e.key) - 1;
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        e.preventDefault();
        setActiveTab(TABS[tabIndex]!.id);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        loadData(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadData]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/golf/login');
  }

  const quickStats = data
    ? [
        {
          key: 'incident-queue',
          label: 'Open Incidents',
          value: `${data.errorLogs.incidentCounts.open}`,
          detail: data.errorLogs.incidentCounts.open > 0
            ? `${data.errorLogs.incidentCounts.openCritical} critical · ${data.errorLogs.incidentCounts.open - data.errorLogs.incidentCounts.openCritical} non-critical open`
            : data.errorLogs.incidentCounts.active > 0
              ? `${data.errorLogs.incidentCounts.active} recently active (not open)`
              : 'No unresolved incidents',
          tone: data.errorLogs.incidentCounts.openCritical > 0
            ? 'critical'
            : data.errorLogs.incidentCounts.open > 0
              ? 'warning'
              : 'healthy',
        },
        {
          key: 'recovery',
          label: 'Resolved (24h)',
          value: `${data.errorLogs.incidentCounts.resolvedRecently}`,
          detail: `${data.errorLogs.incidentCounts.resolved} total resolved incidents`,
          tone: data.errorLogs.incidentCounts.resolvedRecently > 0 ? 'healthy' : 'neutral',
        },
        {
          key: 'sessions',
          label: 'Active Sessions',
          value: `${data.health.activeSessions}`,
          detail: `${data.health.realActiveUsers1h} online in the last hour`,
          tone: data.health.activeSessions > 0 ? 'healthy' : 'neutral',
        },
        {
          key: 'latency',
          label: 'Data Fetch',
          value: (() => {
            const ms = Math.round(data.infraHealth?.totals?.avgResponseMs ?? 0);
            return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
          })(),
          detail: (data.infraHealth?.totals?.avgResponseMs ?? 0) > 6000
            ? 'Server query time is slow — investigate'
            : (data.infraHealth?.totals?.avgResponseMs ?? 0) > 3000
              ? 'Server query time is elevated'
              : 'Server query time is healthy',
          tone: (data.infraHealth?.totals?.avgResponseMs ?? 0) > 6000
            ? 'critical'
            : (data.infraHealth?.totals?.avgResponseMs ?? 0) > 3000
              ? 'warning'
              : 'healthy',
        },
      ] as const
    : null;

  const overallHealth = (data?.errorLogs?.incidentCounts?.openCritical ?? 0) > 0
    ? 'critical'
    : (data?.errorLogs?.incidentCounts?.open ?? 0) > 0
      || (data?.errorLogs?.incidentCounts?.active ?? 0) > 0
      ? 'warning'
      : 'healthy';

  return (
    <div className="min-h-screen bg-[#FFFEF8] flex overflow-x-hidden">
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
        <div className={cn('flex items-center h-16 border-b border-white/10', sidebarCollapsed ? 'justify-center px-2' : 'px-4')}>
          <Link href="/golf/admin" className="flex items-center min-w-0">
            <AdminBrand compact={sidebarCollapsed} />
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;

              // Compute actionable badge count per tab
              let badgeCount = 0;
              if (data) {
                switch (tab.id) {
                  case 'overview':
                    badgeCount = data.needsAttention.filter(
                      (n) => n.severity === 'warning' || n.severity === 'critical'
                    ).length;
                    break;
                  case 'people':
                    badgeCount = data.needsAttention.filter(
                      (n) => n.tab === 'users' && n.severity !== 'info'
                    ).length;
                    break;
                  case 'system':
                    badgeCount = data.errorLogs.incidentCounts.open + data.errorLogs.incidentCounts.active;
                    break;
                  case 'bi':
                    badgeCount = data.bi?.health?.atRiskAccounts?.length ?? 0;
                    break;
                  case 'tracer':
                    // Tracer loads its own data; badge count not available from main data
                    badgeCount = 0;
                    break;
                }
              }
              const showBadge = badgeCount > 0;
              const badgeIsUrgent = tab.id === 'system' && data?.errorLogs.incidentCounts.openCritical
                ? data.errorLogs.incidentCounts.openCritical > 0
                : false;

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
                  {!sidebarCollapsed && showBadge ? (
                    <span
                      className={cn(
                        'flex items-center justify-center min-w-[18px] h-[18px] px-1 text-white text-micro font-bold rounded-full',
                        badgeIsUrgent
                          ? 'bg-red-500 animate-pulse'
                          : tab.id === 'system'
                            ? 'bg-amber-500'
                            : 'bg-warm-500/60'
                      )}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : !sidebarCollapsed ? (
                    <span
                      className={cn(
                        'text-micro px-1.5 py-0.5 rounded font-mono',
                        isActive ? 'bg-white/10 text-warm-300' : 'bg-white/5 text-warm-500'
                      )}
                    >
                      {tab.shortcut}
                    </span>
                  ) : null}
                  {sidebarCollapsed && showBadge && (
                    <span
                      className={cn(
                        'absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-white text-micro font-bold rounded-full',
                        badgeIsUrgent ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
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
              <IconTarget size={20} className="flex-shrink-0" />
              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">Coach CRM</div>
                    <div className="text-label text-warm-500">
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
            <div className="flex items-center justify-between gap-2 px-1">
              <div>
                <div className="text-label font-semibold text-warm-500 uppercase tracking-wider">
                  Quick Stats
                </div>
                <div className="text-[11px] text-warm-600 mt-1">
                  Operational snapshot for the admin rail
                </div>
              </div>
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all duration-300',
                  overallHealth === 'healthy'
                    ? 'border-primary-500/20 bg-primary-500/10 text-primary-300'
                    : overallHealth === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                      : 'border-red-500/30 bg-red-500/15 text-red-300 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    overallHealth === 'healthy'
                      ? 'bg-primary-400'
                      : overallHealth === 'warning'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-red-400 animate-pulse'
                  )}
                />
                {overallHealth}
              </div>
            </div>

            <div className="space-y-2">
              {quickStats.map((stat) => (
                <div
                  key={stat.key}
                  className={cn(
                    'rounded-[10px] border px-3 py-2.5 bg-white/5',
                    stat.tone === 'critical'
                      ? 'border-red-500/20 bg-red-500/5'
                      : stat.tone === 'warning'
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : stat.tone === 'healthy'
                          ? 'border-primary-500/15 bg-primary-500/5'
                          : 'border-white/5'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warm-500">
                        {stat.label}
                      </div>
                      <div className="text-[11px] leading-5 text-warm-600 mt-1">
                        {stat.detail}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold tabular-nums shrink-0',
                        stat.tone === 'critical'
                          ? 'text-red-300'
                          : stat.tone === 'warning'
                            ? 'text-amber-300'
                            : stat.tone === 'healthy'
                              ? 'text-primary-300'
                              : 'text-white'
                      )}
                    >
                      {stat.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Connection Status */}
            <div className="rounded-[10px] p-2.5 bg-white/5 border border-white/5">
              <div className="flex items-center justify-between gap-3">
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
                      realtime.isConnected ? 'text-warm-300' : 'text-amber-300'
                    )}
                  >
                    {realtime.isConnected ? 'Live Updates' : 'Realtime Reconnecting'}
                  </span>
                </div>
                <span className="text-[11px] text-warm-500">
                  {alerts.unreadCount > 0 ? `${alerts.unreadCount} unread` : 'All caught up'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-4 top-20 w-8 h-8 rounded-full bg-[#1C1917] border border-white/20 flex items-center justify-center text-warm-400 hover:text-white transition-colors shadow-lg"
        >
          {sidebarCollapsed ? <IconChevronRight size={14} /> : <ChevronLeft size={14} />}
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
          <Link href="/golf/admin" className="flex items-center min-w-0">
            <AdminBrand />
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-3 text-warm-400 hover:text-white transition-colors"
          >
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
                  'w-full flex items-center gap-3 px-3 py-3 rounded-[10px] transition-colors',
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
            className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-primary-400 hover:bg-white/5 transition-colors mt-4 pt-4 border-t border-white/10"
          >
            <IconTarget size={20} />
            <span className="text-sm font-medium">Coach CRM</span>
          </Link>
        </nav>

        {/* Mobile Quick Stats — compact 2x2 grid */}
        {quickStats && (
          <div className="px-3 pb-3 border-t border-white/10 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warm-600 px-1 mb-2">
              Quick Stats
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickStats.map((stat) => (
                <div
                  key={stat.key}
                  className={cn(
                    'rounded-[10px] border px-2.5 py-2 bg-white/5',
                    stat.tone === 'critical'
                      ? 'border-red-500/20 bg-red-500/5'
                      : stat.tone === 'warning'
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : stat.tone === 'healthy'
                          ? 'border-primary-500/15 bg-primary-500/5'
                          : 'border-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      stat.tone === 'critical'
                        ? 'text-red-300'
                        : stat.tone === 'warning'
                          ? 'text-amber-300'
                          : stat.tone === 'healthy'
                            ? 'text-primary-300'
                            : 'text-white'
                    )}
                  >
                    {stat.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-warm-600 mt-0.5 leading-tight">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/80 active:bg-warm-200 transition-colors shrink-0"
            >
              <Menu size={22} />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              {lastRefresh && (
                <span className="text-xs text-warm-400 tabular-nums hidden md:block truncate">
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
                <IconRefresh size={18} />
              </button>

              <Link
                href="/golf/admin/crm"
                className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors"
              >
                <IconTarget size={16} />
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
        <div className="flex-1 lg:overflow-y-auto p-3 sm:p-4 md:p-6 min-w-0 overflow-x-hidden">
          {sessionExpired ? (
            <div
              className={cn(
                'bg-white/70 backdrop-blur-xl border border-amber-200/50 rounded-2xl shadow-glass p-8 text-center max-w-md mx-auto mt-12'
              )}
            >
              <div className="text-amber-600 mb-2">
                <LogOut size={32} className="mx-auto" />
              </div>
              <h2 className="text-lg font-semibold text-warm-900 mb-2">Session Expired</h2>
              <p className="text-sm text-warm-500 mb-4">
                Your session has expired or you are no longer authorized. Please log in again to continue.
              </p>
              <button
                onClick={() => router.push('/golf/login')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
              >
                Log In Again
              </button>
            </div>
          ) : error ? (
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
              {(data.errorSummaryDegraded || data.adminEventSummaryDegraded) && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50/80 border border-amber-200/50 text-amber-700 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  Some metrics are using approximate calculations (database functions unavailable)
                </div>
              )}
              {activeTab === 'overview' && (
                <OverviewTab data={data} onNavigateTab={handleNavigateTab} />
              )}
              <Suspense fallback={<TabLoadingSkeleton />}>
                {activeTab === 'people' && <PeopleTab data={data} />}
                {activeTab === 'system' && <SystemTab data={data} />}
                {activeTab === 'bi' && <BusinessIntelligenceTab data={data} />}
                {activeTab === 'tracer' && <TracerTab />}
              </Suspense>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
