'use client';

/**
 * CoachAlertCenter — migrated under Wave 1A of the Insight Delivery phase.
 *
 * Rendering model (new):
 *   - Hero card at the top: the top-ranked urgent/high insight at
 *     `density='hero'` (morning brief affordance).
 *   - Compact rows below: remaining urgent/high insights at `density='compact'`.
 *
 * Data source: `getInsightsForCoach(coachId, { priorities: ['urgent','high'] })`
 * — evidence-backed rows only. No more legacy `AlertCard`.
 */
import { useState, useTransition, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconBell, IconChevronRight, IconSparkles, IconRefresh } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
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

interface CoachAlertCenterProps {
  coachId: string;
  teamId: string;
  /** Optional pre-fetched alerts (server-rendered). */
  initialAlerts?: EvidenceInsight[];
  /** Max compact rows shown under the hero (excluding hero). */
  maxVisible?: number;
}

export function CoachAlertCenter({
  coachId,
  teamId,
  initialAlerts = [],
  maxVisible = 5,
}: CoachAlertCenterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [alerts, setAlerts] = useState<EvidenceInsight[]>(initialAlerts);
  const [error, setError] = useState<string | null>(null);
  const [, startActionTransition] = useTransition();

  // Initial fetch.
  useEffect(() => {
    if (initialAlerts.length > 0) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const rows = await getInsightsForCoach(coachId, {
          priorities: ['urgent', 'high'],
          limit: 20,
        });
        if (!cancelled) setAlerts(rows);
      } catch {
        if (!cancelled) {
          setError('Could not connect to load alerts. Try refreshing.');
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [coachId, initialAlerts.length]);

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      try {
        // `generateAlerts` refreshes the server-side alert set; we then
        // re-read evidence-backed rows from the single source of truth.
        await generateAlerts(coachId, teamId);
        const rows = await getInsightsForCoach(coachId, {
          priorities: ['urgent', 'high'],
          limit: 20,
        });
        setAlerts(rows);
      } catch {
        setError('Failed to refresh alerts.');
      }
    });
  };

  const handleAction = useCallback(
    (action: InsightAction, insightId: string) => {
      const prev = alerts;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setAlerts((rows) => rows.filter((r) => r.id !== insightId));
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setAlerts(prev);
          } else if (action === 'dismissed') {
            setAlerts((rows) => rows.filter((r) => r.id !== insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setAlerts(prev);
          } else if (action === 'create_focus_area') {
            const target = alerts.find((r) => r.id === insightId);
            if (!target) return;
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
        }
      });
    },
    [alerts, coachId, router],
  );

  const criticalCount = alerts.filter((a) => a.priority === 'urgent').length;
  const warningCount = alerts.filter((a) => a.priority === 'high').length;
  const totalNeedAttention = criticalCount + warningCount;

  // Hero is the top ranked row; rest render compact.
  const [heroInsight, ...rest] = alerts;
  const compactRows = rest.slice(0, maxVisible);
  const hiddenCount = Math.max(0, rest.length - maxVisible);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'relative p-2 rounded-xl',
              criticalCount > 0
                ? 'bg-gradient-to-br from-red-500 to-rose-600'
                : warningCount > 0
                  ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                  : 'bg-warm-400/85',
            )}
          >
            <IconBell size={18} className="text-white" aria-hidden="true" />
            {totalNeedAttention > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  'absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center',
                  'text-[11px] font-medium text-white rounded-full',
                  criticalCount > 0 ? 'bg-red-600' : 'bg-amber-600',
                )}
                role="status"
              >
                {totalNeedAttention}
                <span className="sr-only">
                  {` alert${totalNeedAttention !== 1 ? 's' : ''} need attention`}
                </span>
              </motion.span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-warm-800">Player Alerts</h3>
            <p className="text-xs text-warm-500">
              {totalNeedAttention > 0
                ? `${totalNeedAttention} need${totalNeedAttention === 1 ? 's' : ''} attention`
                : 'All clear'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isPending}
            aria-label={isPending ? 'Scanning team for alerts' : 'Scan team for alerts'}
            className={cn(
              'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
              isPending
                ? 'bg-warm-100 text-warm-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
            )}
          >
            {isPending ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <IconRefresh size={14} />
                </motion.div>
                <span className="hidden sm:inline">Scanning...</span>
              </>
            ) : (
              <>
                <IconSparkles size={14} />
                <span className="hidden sm:inline">Scan Team</span>
              </>
            )}
          </button>

          {alerts.length > 0 && (
            <a
              href="/golf/dashboard/alerts"
              className="flex items-center gap-1 text-xs font-medium text-warm-500 hover:text-warm-700 transition-colors"
            >
              View All
              <IconChevronRight size={14} />
            </a>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
          className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600"
        >
          {error}
        </motion.div>
      )}

      {/* Alerts Stack */}
      <GlassCard className="p-3" glow={criticalCount > 0 ? 'green' : 'subtle'}>
        <AnimatePresence>
          {heroInsight ? (
            <div className="space-y-3" data-testid="coach-alert-stack">
              <InsightCard
                insight={heroInsight}
                density="hero"
                audience="coach"
                showActions
                onAction={handleAction}
              />

              {compactRows.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  density="compact"
                  audience="coach"
                  onClick={(id) => router.push(`/golf/dashboard/alerts#${id}`)}
                />
              ))}

              {hiddenCount > 0 && (
                <motion.a
                  href="/golf/dashboard/alerts"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    'flex items-center justify-center gap-2 py-3 rounded-xl',
                    'text-sm font-medium text-warm-500 hover:text-warm-700',
                    'bg-warm-50 hover:bg-warm-100 active:bg-warm-200 transition-colors',
                  )}
                >
                  <span>
                    +{hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}
                  </span>
                  <IconChevronRight size={16} />
                </motion.a>
              )}
            </div>
          ) : (
            <EmptyAlertState />
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}

function EmptyAlertState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-8 text-center"
    >
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center mb-3',
          'bg-gradient-to-br from-primary-100 to-primary-100',
        )}
      >
        <IconBell size={24} className="text-primary-600" />
      </div>
      <h4 className="text-sm font-semibold text-warm-700 mb-1">All Clear!</h4>
      <p className="text-xs text-warm-400 max-w-[200px]">
        No alerts right now. Your players are on track.
      </p>
    </motion.div>
  );
}
