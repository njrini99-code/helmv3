'use client';

import { useState, useEffect, useTransition } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { MobileMenuButton } from '@/components/golf/MobileMenuButton';
import {
  IconBell,
  IconCheck,
  IconX,
  IconRefresh,
  IconSparkles,
  IconChevronLeft,
} from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { useGolfUser } from '@/contexts/golf-user-context';
import { AlertCard, type CoachAlert, type AlertLevel } from '@/components/golf/coachhelm/alerts';
import {
  getCoachAlerts,
  dismissAlert,
  acknowledgeAlert,
  dismissAllAlerts,
  acknowledgeAllAlerts,
  generateAlerts,
} from '@/app/golf/actions/alerts';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';

type FilterLevel = AlertLevel | 'all';

export default function AlertsPage() {
  const router = useRouter();
  const golfUser = useGolfUser();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<CoachAlert[]>([]);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use IDs from context
  const coachId = golfUser.coachId || null;
  const teamId = golfUser.teamId || null;

  // Fetch alerts (coach/team IDs come from context)
  useEffect(() => {
    async function loadData() {
      if (!coachId) {
        router.push('/golf/dashboard');
        return;
      }

      try {
        const result = await getCoachAlerts(coachId, teamId || '', {
          includeAcknowledged: showAcknowledged,
          limit: 100,
        });

        if (result.success && result.alerts) {
          setAlerts(result.alerts);
        } else {
          setError(result.error || 'Failed to load alerts.');
        }
      } catch {
        setError('Something went wrong loading alerts. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAcknowledged]);

  const handleDismiss = async (alertId: string) => {
    const alertToRemove = alerts.find(a => a.id === alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setError(null);

    try {
      const result = await dismissAlert(alertId);
      if (!result.success) {
        if (alertToRemove) {
          setAlerts(prev => [...prev, alertToRemove].sort((a, b) =>
            (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
          ));
        }
        setError('Failed to dismiss alert. It has been restored.');
      }
    } catch {
      if (alertToRemove) {
        setAlerts(prev => [...prev, alertToRemove].sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        ));
      }
      setError('Network error — alert has been restored.');
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    const previousAlert = alerts.find(a => a.id === alertId);
    const previousAcknowledgedAt = previousAlert?.acknowledgedAt ?? null;

    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a
    ));
    setError(null);

    try {
      const result = await acknowledgeAlert(alertId);
      if (!result.success) {
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, acknowledgedAt: previousAcknowledgedAt } : a
        ));
        setError('Failed to acknowledge alert.');
      }
    } catch {
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, acknowledgedAt: previousAcknowledgedAt } : a
      ));
      setError('Network error — acknowledgment reverted.');
    }
  };

  const handleDismissAll = async () => {
    if (!coachId) return;
    const previousAlerts = [...alerts];
    startTransition(async () => {
      setError(null);
      try {
        const result = await dismissAllAlerts(coachId, {
          level: filterLevel !== 'all' ? filterLevel : undefined,
        });
        if (result.success) {
          setAlerts(prev => prev.filter(a =>
            filterLevel === 'all' ? false : a.level !== filterLevel
          ));
        } else {
          setError(result.error || 'Failed to dismiss all alerts.');
        }
      } catch {
        setAlerts(previousAlerts);
        setError('Network error — dismiss all failed.');
      }
    });
  };

  const handleAcknowledgeAll = async () => {
    if (!coachId) return;
    const previousAlerts = [...alerts];
    startTransition(async () => {
      setError(null);
      try {
        const result = await acknowledgeAllAlerts(coachId);
        if (result.success) {
          setAlerts(prev => prev.map(a => ({
            ...a,
            acknowledgedAt: a.acknowledgedAt || new Date().toISOString(),
          })));
        } else {
          setError(result.error || 'Failed to acknowledge all alerts.');
        }
      } catch {
        setAlerts(previousAlerts);
        setError('Network error — acknowledge all failed.');
      }
    });
  };

  const handleRefresh = () => {
    if (!coachId || !teamId) return;
    startTransition(async () => {
      setError(null);
      const result = await generateAlerts(coachId, teamId);
      if (result.success && result.alerts) {
        setAlerts(result.alerts);
      } else {
        setError(result.error || 'Failed to scan team');
      }
    });
  };

  // Filter alerts
  const filteredAlerts = alerts.filter(alert => {
    if (filterLevel !== 'all' && alert.level !== filterLevel) return false;
    if (!showAcknowledged && alert.acknowledgedAt) return false;
    return true;
  });

  // Count by level
  const countByLevel = {
    critical: alerts.filter(a => a.level === 'critical' && !a.acknowledgedAt).length,
    warning: alerts.filter(a => a.level === 'warning' && !a.acknowledgedAt).length,
    info: alerts.filter(a => a.level === 'info' && !a.acknowledgedAt).length,
    suggestion: alerts.filter(a => a.level === 'suggestion' && !a.acknowledgedAt).length,
  };
  const visibleAlertCount = showAcknowledged
    ? alerts.length
    : alerts.filter(a => !a.acknowledgedAt).length;
  const filterTabs: { id: FilterLevel; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: visibleAlertCount },
    { id: 'critical', label: 'Critical', count: countByLevel.critical },
    { id: 'warning', label: 'Warning', count: countByLevel.warning },
    { id: 'info', label: 'Info', count: countByLevel.info },
    { id: 'suggestion', label: 'Suggestions', count: countByLevel.suggestion },
  ];

  if (isLoading) {
    return (
      <div className="min-h-full bg-transparent">
        <div className="golf-mobile-page-header glass-standard border-white/30 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="h-5 w-5 skeleton-shimmer rounded-lg lg:hidden" />
              <div>
                <div className="h-6 w-40 skeleton-shimmer rounded-lg" />
                <div className="h-3 w-64 skeleton-shimmer rounded mt-2" />
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-20 skeleton-shimmer rounded-full" />
            ))}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-standard rounded-2xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 skeleton-shimmer rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 skeleton-shimmer rounded" />
                  <div className="h-3 w-full skeleton-shimmer rounded" />
                  <div className="h-3 w-1/2 skeleton-shimmer rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <m.div
      className="min-h-full bg-transparent"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <m.div variants={itemVariants} className={cn(
        'golf-mobile-page-header',
        'glass-standard',
        'border-white/30',
        'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
      )}>
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <MobileMenuButton />
              <button
                onClick={() => router.back()}
                className="hidden lg:block p-2 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-white/50 transition-colors"
              >
                <IconChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900 flex items-center gap-2">
                  <IconBell size={24} className="text-primary-600" />
                  Player Alerts
                </h1>
                <p className="text-warm-500 mt-0.5 text-sm">
                  AI-generated insights about players who need attention
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl font-medium transition-all active:scale-95',
                isPending
                  ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md'
              )}
            >
              {isPending ? (
                <>
                  <m.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <IconRefresh size={18} />
                  </m.div>
                  Scanning...
                </>
              ) : (
                <>
                  <IconSparkles size={18} />
                  Scan Team
                </>
              )}
            </button>
          </div>
        </div>
      </m.div>

      {/* Main Content */}
      <m.div variants={itemVariants} className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
              className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 flex items-center justify-between"
            >
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <IconX size={18} />
              </button>
            </m.div>
          )}
        </AnimatePresence>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          {/* Level Filters */}
          <div className="min-w-0 flex-1">
            <GolfTabBar
              tabs={filterTabs}
              value={filterLevel}
              onChange={setFilterLevel}
              ariaLabel="Alert levels"
              compact
              scrollable
            />
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-warm-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-warm-300 text-primary-600 focus:ring-primary-500"
              />
              Show acknowledged
            </label>

            {filteredAlerts.length > 0 && (
              <>
                <button
                  onClick={handleAcknowledgeAll}
                  disabled={isPending}
                  className="flex items-center gap-1 text-sm font-medium text-warm-500 hover:text-warm-700 px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-white/50 active:bg-warm-100 transition-colors"
                >
                  <IconCheck size={14} />
                  Acknowledge All
                </button>
                <button
                  onClick={handleDismissAll}
                  disabled={isPending}
                  className="flex items-center gap-1 text-sm font-medium text-red-500 hover:text-red-700 px-3 py-2.5 min-h-[44px] rounded-lg hover:bg-red-50 active:bg-red-100 transition-colors"
                >
                  <IconX size={14} />
                  Dismiss All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alerts List */}
        <GlassCard className="p-4" glow="subtle">
          <AnimatePresence mode="popLayout">
            {filteredAlerts.length > 0 ? (
              <div className="space-y-3">
                {filteredAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={() => handleDismiss(alert.id)}
                    onAcknowledge={() => handleAcknowledge(alert.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyAlertsState filter={filterLevel} />
            )}
          </AnimatePresence>
        </GlassCard>
      </m.div>
    </m.div>
  );
}

function EmptyAlertsState({ filter }: { filter: FilterLevel }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center mb-4',
        'bg-gradient-to-br from-primary-50 to-primary-100'
      )}>
        <IconBell size={32} className="text-primary-600" />
      </div>
      <h3 className="text-lg font-semibold text-warm-700 mb-2">
        {filter === 'all' ? 'All Clear!' : `No ${filter} alerts`}
      </h3>
      <p className="text-sm text-warm-400 max-w-[300px]">
        {filter === 'all'
          ? 'No alerts at the moment. Your players are on track.'
          : `There are no ${filter} level alerts right now.`}
      </p>
    </m.div>
  );
}
