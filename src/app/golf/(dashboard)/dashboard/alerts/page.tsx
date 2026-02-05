'use client';

import { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  IconBell,
  IconFilter,
  IconCheck,
  IconX,
  IconRefresh,
  IconSparkles,
  IconChevronLeft,
} from '@/components/icons';
import { GlassCard } from '@/components/ui/glass-card';
import { AlertCard, type CoachAlert, type AlertLevel } from '@/components/golf/coachhelm/alerts';
import {
  getCoachAlerts,
  dismissAlert,
  acknowledgeAlert,
  dismissAllAlerts,
  acknowledgeAllAlerts,
  generateAlerts,
} from '@/app/golf/actions/alerts';
import { PageLoading } from '@/components/ui/loading';

type FilterLevel = AlertLevel | 'all';

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<CoachAlert[]>([]);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch coach and team data
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/golf/login');
        return;
      }

      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!coach) {
        router.push('/golf/dashboard');
        return;
      }

      setCoachId(coach.id);

      // Get team via organization
      if (coach.organization_id) {
        const { data: team } = await supabase
          .from('golf_teams')
          .select('id')
          .eq('organization_id', coach.organization_id)
          .maybeSingle();

        if (team) {
          setTeamId(team.id);
        }
      }

      // Fetch alerts
      const result = await getCoachAlerts(coach.id, teamId || '', {
        includeAcknowledged: showAcknowledged,
        limit: 100,
      });

      if (result.success && result.alerts) {
        setAlerts(result.alerts);
      }

      setIsLoading(false);
    }

    loadData();
  }, [supabase, router, showAcknowledged, teamId]);

  const handleDismiss = async (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    await dismissAlert(alertId);
  };

  const handleAcknowledge = async (alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a
    ));
    await acknowledgeAlert(alertId);
  };

  const handleDismissAll = async () => {
    if (!coachId) return;
    startTransition(async () => {
      const result = await dismissAllAlerts(coachId, {
        level: filterLevel !== 'all' ? filterLevel : undefined,
      });
      if (result.success) {
        setAlerts(prev => prev.filter(a =>
          filterLevel === 'all' ? false : a.level !== filterLevel
        ));
      }
    });
  };

  const handleAcknowledgeAll = async () => {
    if (!coachId) return;
    startTransition(async () => {
      const result = await acknowledgeAllAlerts(coachId);
      if (result.success) {
        setAlerts(prev => prev.map(a => ({
          ...a,
          acknowledgedAt: a.acknowledgedAt || new Date().toISOString(),
        })));
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

  if (isLoading) {
    return <PageLoading />;
  }

  return (
    <div className="min-h-full bg-transparent">
      {/* Header */}
      <div className={cn(
        'sticky top-0 z-20',
        'bg-white/60 backdrop-blur-[24px]',
        'border-b border-white/30',
        'shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
      )}>
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/50 transition-colors"
              >
                <IconChevronLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <IconBell size={24} className="text-primary-600" />
                  Player Alerts
                </h1>
                <p className="text-slate-500 mt-0.5 text-sm">
                  AI-generated insights about players who need attention
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all',
                isPending
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-md'
              )}
            >
              {isPending ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <IconRefresh size={18} />
                  </motion.div>
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
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 flex items-center justify-between"
            >
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <IconX size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          {/* Level Filters */}
          <div className="flex items-center gap-2">
            <IconFilter size={16} className="text-slate-400" />
            <div className="flex gap-1 p-1 bg-white/60 backdrop-blur-sm rounded-xl border border-white/30">
              {(['all', 'critical', 'warning', 'info', 'suggestion'] as FilterLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setFilterLevel(level)}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                    filterLevel === level
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
                  {level !== 'all' && countByLevel[level] > 0 && (
                    <span className={cn(
                      'ml-1.5 px-1.5 py-0.5 text-xs rounded-full',
                      level === 'critical' ? 'bg-red-100 text-red-700' :
                      level === 'warning' ? 'bg-amber-100 text-amber-700' :
                      level === 'info' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    )}>
                      {countByLevel[level]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showAcknowledged}
                onChange={(e) => setShowAcknowledged(e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Show acknowledged
            </label>

            {filteredAlerts.length > 0 && (
              <>
                <button
                  onClick={handleAcknowledgeAll}
                  disabled={isPending}
                  className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-white/50 transition-colors"
                >
                  <IconCheck size={14} />
                  Acknowledge All
                </button>
                <button
                  onClick={handleDismissAll}
                  disabled={isPending}
                  className="flex items-center gap-1 text-sm font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
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
      </div>
    </div>
  );
}

function EmptyAlertsState({ filter }: { filter: FilterLevel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className={cn(
        'w-16 h-16 rounded-full flex items-center justify-center mb-4',
        'bg-gradient-to-br from-green-100 to-emerald-100'
      )}>
        <IconBell size={32} className="text-green-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">
        {filter === 'all' ? 'All Clear!' : `No ${filter} alerts`}
      </h3>
      <p className="text-sm text-slate-400 max-w-[300px]">
        {filter === 'all'
          ? 'No alerts at the moment. Your players are on track.'
          : `There are no ${filter} level alerts right now.`}
      </p>
    </motion.div>
  );
}
