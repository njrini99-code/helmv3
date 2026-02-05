'use client';

import { useState, useTransition, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconBell, IconChevronRight, IconSparkles, IconRefresh } from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { AlertCard, type CoachAlert } from './AlertCard';
import { getCoachAlerts, dismissAlert, acknowledgeAlert, generateAlerts } from '@/app/golf/actions/alerts';

interface CoachAlertCenterProps {
  coachId: string;
  teamId: string;
  initialAlerts?: CoachAlert[];
  maxVisible?: number;
  compact?: boolean;
}

export function CoachAlertCenter({
  coachId,
  teamId,
  initialAlerts = [],
  maxVisible = 5,
  compact = false,
}: CoachAlertCenterProps) {
  const [isPending, startTransition] = useTransition();
  const [alerts, setAlerts] = useState<CoachAlert[]>(initialAlerts);
  const [error, setError] = useState<string | null>(null);

  // Fetch alerts on mount
  useEffect(() => {
    if (initialAlerts.length === 0) {
      startTransition(async () => {
        try {
          const result = await getCoachAlerts(coachId, teamId);
          if (result.success && result.alerts) {
            setAlerts(result.alerts);
          } else {
            setError(result.error || 'Failed to load alerts');
          }
        } catch (err) {
          console.error('[CoachHelm] Error loading alerts:', err);
          setError('Could not connect to load alerts. Try refreshing.');
        }
      });
    }
  }, [coachId, teamId, initialAlerts.length]);

  const handleDismiss = async (alertId: string) => {
    // Capture the alert before removing so we can restore on failure
    const alertToRemove = alerts.find(a => a.id === alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setError(null);

    try {
      const result = await dismissAlert(alertId);
      if (!result.success) {
        // Restore the alert on failure
        if (alertToRemove) {
          setAlerts(prev => [...prev, alertToRemove].sort((a, b) =>
            (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
          ));
        }
        setError('Failed to dismiss alert. It has been restored.');
      }
    } catch (err) {
      console.error('[CoachHelm] Error dismissing alert:', err);
      // Restore on unexpected error
      if (alertToRemove) {
        setAlerts(prev => [...prev, alertToRemove].sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        ));
      }
      setError('Network error — alert has been restored.');
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    // Capture previous state for rollback
    const previousAlert = alerts.find(a => a.id === alertId);
    const previousAcknowledgedAt = previousAlert?.acknowledgedAt ?? null;

    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a
    ));
    setError(null);

    try {
      const result = await acknowledgeAlert(alertId);
      if (!result.success) {
        // Revert the optimistic update
        setAlerts(prev => prev.map(a =>
          a.id === alertId ? { ...a, acknowledgedAt: previousAcknowledgedAt } : a
        ));
        setError('Failed to acknowledge alert.');
      }
    } catch (err) {
      console.error('[CoachHelm] Error acknowledging alert:', err);
      // Revert on unexpected error
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, acknowledgedAt: previousAcknowledgedAt } : a
      ));
      setError('Network error — acknowledgment reverted.');
    }
  };

  const handleRefresh = () => {
    startTransition(async () => {
      setError(null);
      const result = await generateAlerts(coachId, teamId);
      if (result.success && result.alerts) {
        setAlerts(result.alerts);
      } else {
        setError(result.error || 'Failed to generate alerts');
      }
    });
  };

  // Count by severity
  const criticalCount = alerts.filter(a => a.level === 'critical').length;
  const warningCount = alerts.filter(a => a.level === 'warning').length;
  const totalNeedAttention = criticalCount + warningCount;

  const visibleAlerts = alerts.slice(0, maxVisible);
  const hiddenCount = alerts.length - maxVisible;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'relative p-2 rounded-xl',
            criticalCount > 0
              ? 'bg-gradient-to-br from-red-500 to-rose-600'
              : warningCount > 0
                ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                : 'bg-gradient-to-br from-slate-400 to-slate-500'
          )}>
            <IconBell size={18} className="text-white" aria-hidden="true" />
            {totalNeedAttention > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  'absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center',
                  'text-[10px] font-bold text-white rounded-full',
                  criticalCount > 0 ? 'bg-red-600' : 'bg-amber-600'
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
            <h3 className="text-sm font-semibold text-slate-800">Player Alerts</h3>
            <p className="text-xs text-slate-500">
              {totalNeedAttention > 0
                ? `${totalNeedAttention} need${totalNeedAttention === 1 ? 's' : ''} attention`
                : 'All clear'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isPending}
            aria-label={isPending ? 'Scanning team for alerts' : 'Scan team for alerts'}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all',
              isPending
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
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
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              View All
              <IconChevronRight size={14} />
            </a>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600"
        >
          {error}
        </motion.div>
      )}

      {/* Alerts List */}
      <GlassCard className="p-3" glow={criticalCount > 0 ? 'green' : 'subtle'}>
        <AnimatePresence mode="popLayout">
          {visibleAlerts.length > 0 ? (
            <div className="space-y-2">
              {visibleAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  compact={compact}
                  onDismiss={() => handleDismiss(alert.id)}
                  onAcknowledge={() => handleAcknowledge(alert.id)}
                />
              ))}

              {hiddenCount > 0 && (
                <motion.a
                  href="/golf/dashboard/alerts"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    'flex items-center justify-center gap-2 py-3 rounded-xl',
                    'text-sm font-medium text-slate-500 hover:text-slate-700',
                    'bg-slate-50 hover:bg-slate-100 transition-colors'
                  )}
                >
                  <span>+{hiddenCount} more alert{hiddenCount > 1 ? 's' : ''}</span>
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
      <div className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center mb-3',
        'bg-gradient-to-br from-green-100 to-emerald-100'
      )}>
        <IconBell size={24} className="text-green-600" />
      </div>
      <h4 className="text-sm font-semibold text-slate-700 mb-1">
        All Clear!
      </h4>
      <p className="text-xs text-slate-400 max-w-[200px]">
        No alerts right now. Your players are on track.
      </p>
    </motion.div>
  );
}
