'use client';

/**
 * /dashboard/alerts — migrated under Wave 1A of the Insight Delivery phase.
 *
 * Reads evidence-backed rows via `getInsightsForCoach`, renders the top row
 * as a hero card and the remainder in compact density through the unified
 * `InsightCard` primitive.
 *
 * Filter tabs still expose the familiar severity language (critical / warning
 * / info / suggestion) but map to `priority` under the hood.
 */
import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { GolfTabBar } from '@/components/golf/GolfTabBar';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import {
  IconBell,
  IconX,
  IconRefresh,
  IconSparkles,
} from '@/components/icons';

import { useGolfUser } from '@/contexts/golf-user-context';
import {
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import {
  acknowledgeInsight,
  dismissInsight,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { generateAlerts } from '@/app/golf/actions/alerts';
import { containerVariants, itemVariants } from '@/components/golf/dashboard/premium-components';
import { PullToRefresh } from '@/components/golf/PullToRefresh';

/** UX-level filter names carried over from the legacy AlertCard surface. */
type FilterLevel = 'all' | 'critical' | 'warning' | 'info' | 'suggestion';

/** UX level ⇄ insight priority mapping. The legacy AlertCard spoke in
 *  severity; the unified primitive speaks in priority. Keep the labels for
 *  coach familiarity but translate before querying. */
const LEVEL_PRIORITY: Record<Exclude<FilterLevel, 'all'>, EvidenceInsight['priority']> = {
  critical: 'urgent',
  warning: 'high',
  info: 'medium',
  suggestion: 'low',
};

function insightLevel(insight: EvidenceInsight): Exclude<FilterLevel, 'all'> {
  switch (insight.priority) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'suggestion';
    default:
      return 'info';
  }
}

export default function AlertsPage() {
  const router = useRouter();
  const golfUser = useGolfUser();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<EvidenceInsight[]>([]);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startActionTransition] = useTransition();

  const coachId = golfUser.coachId || null;
  const teamId = golfUser.teamId || null;

  // Fetch alerts (evidence-backed rows only).
  useEffect(() => {
    if (!coachId) return;

    let cancelled = false;
    async function loadData() {
      try {
        const rows = await getInsightsForCoach(coachId!, { limit: 100 });
        if (cancelled) return;
        setAlerts(rows);
      } catch {
        if (!cancelled) {
          setError('Something went wrong loading alerts. Please refresh.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  const reload = useCallback(async () => {
    if (!coachId) return;
    try {
      const rows = await getInsightsForCoach(coachId, { limit: 100 });
      setAlerts(rows);
      setError(null);
    } catch {
      setError('Something went wrong refreshing alerts.');
    }
  }, [coachId]);

  const handleAction = useCallback(
    (action: InsightAction, insightId: string) => {
      const prev = alerts;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setAlerts((rows) =>
              rows.map((r) =>
                r.id === insightId
                  ? { ...r, acknowledged_at: new Date().toISOString(), status: 'acknowledged' }
                  : r,
              ),
            );
            const res = await acknowledgeInsight(insightId);
            if (!res.success) {
              setAlerts(prev);
              setError('Failed to acknowledge alert.');
            }
          } else if (action === 'dismissed') {
            setAlerts((rows) => rows.filter((r) => r.id !== insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) {
              setAlerts(prev);
              setError('Failed to dismiss alert. It has been restored.');
            }
          } else if (action === 'create_focus_area') {
            const target = alerts.find((r) => r.id === insightId);
            if (!target || !coachId) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) router.push('/golf/dashboard/development');
          }
        } catch {
          setAlerts(prev);
          setError('Network error — no changes saved.');
        }
      });
    },
    [alerts, coachId, router],
  );

  const handleRefresh = () => {
    if (!coachId || !teamId) return;
    startTransition(async () => {
      setError(null);
      try {
        // `generateAlerts` rebuilds the alert candidates on the server; we
        // then re-read the canonical evidence-backed rows.
        await generateAlerts(coachId, teamId);
        await reload();
      } catch {
        setError('Failed to scan team');
      }
    });
  };

  const handlePullToRefresh = async () => {
    await reload();
  };

  // Apply client-side filters: level + acknowledged.
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (filterLevel !== 'all') {
        if (a.priority !== LEVEL_PRIORITY[filterLevel]) return false;
      }
      if (!showAcknowledged && a.acknowledged_at) return false;
      return true;
    });
  }, [alerts, filterLevel, showAcknowledged]);

  // Count by level (only unacknowledged).
  const countByLevel = useMemo(() => {
    return {
      critical: alerts.filter((a) => insightLevel(a) === 'critical' && !a.acknowledged_at).length,
      warning: alerts.filter((a) => insightLevel(a) === 'warning' && !a.acknowledged_at).length,
      info: alerts.filter((a) => insightLevel(a) === 'info' && !a.acknowledged_at).length,
      suggestion: alerts.filter((a) => insightLevel(a) === 'suggestion' && !a.acknowledged_at).length,
    };
  }, [alerts]);

  const visibleAlertCount = showAcknowledged
    ? alerts.length
    : alerts.filter((a) => !a.acknowledged_at).length;

  const filterTabs: { id: FilterLevel; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: visibleAlertCount },
    { id: 'critical', label: 'Critical', count: countByLevel.critical },
    { id: 'warning', label: 'Warning', count: countByLevel.warning },
    { id: 'info', label: 'Info', count: countByLevel.info },
    { id: 'suggestion', label: 'Suggestions', count: countByLevel.suggestion },
  ];

  const [heroInsight, ...rest] = filteredAlerts;

  if (isLoading) {
    return (
      <div className="min-h-full bg-transparent">
        <div className="sticky top-0 z-20 border-b border-warm-200/30 bg-white/70 backdrop-blur-xl pt-[max(0.25rem,env(safe-area-inset-top,0px))] lg:pt-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-5">
            <div className="flex items-center gap-3">
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
            <div key={i} className="glass-premium rounded-2xl p-5 space-y-3">
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
      <LargeTitleHeader
        title="Player Alerts"
        subtitle="AI-generated insights about players who need attention"
      >
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className={cn(
            'flex items-center gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl font-medium transition-all active:scale-95',
            isPending
              ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md',
          )}
        >
          {isPending ? (
            <>
              <m.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <IconRefresh size={16} />
              </m.div>
              <span className="hidden sm:inline">Scanning...</span>
            </>
          ) : (
            <>
              <IconSparkles size={16} />
              <span className="hidden sm:inline">Scan Team</span>
              <span className="sm:hidden">Scan</span>
            </>
          )}
        </button>
      </LargeTitleHeader>

      <PullToRefresh onRefresh={handlePullToRefresh}>
        <m.div variants={itemVariants} className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
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

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-warm-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAcknowledged}
                  onChange={(e) => setShowAcknowledged(e.target.checked)}
                  className="rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                />
                Show acknowledged
              </label>
            </div>
          </div>

          {/* Alerts Stack */}
          <div className="glass-premium rounded-2xl p-4">
            <AnimatePresence mode="popLayout">
              {filteredAlerts.length > 0 ? (
                <div className="space-y-3" data-testid="coach-alert-stack">
                  {heroInsight && (
                    <InsightCard
                      insight={heroInsight}
                      density="hero"
                      audience="coach"
                      showActions
                      onAction={handleAction}
                    />
                  )}

                  {rest.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      density="compact"
                      audience="coach"
                      onClick={(id) => router.push(`/golf/dashboard/players/${insight.player_id}#${id}`)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyAlertsState filter={filterLevel} />
              )}
            </AnimatePresence>
          </div>
        </m.div>
      </PullToRefresh>
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
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center mb-4',
          'bg-gradient-to-br from-primary-50 to-primary-100',
        )}
      >
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
