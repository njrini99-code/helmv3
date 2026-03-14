'use client';

import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconCircleDot,
  IconCheckCircle2,
  IconXCircle,
  IconWarning,
} from '@/components/icons';
import { TracerKPICards } from './TracerKPICards';
import { TracerAlertPanel } from './TracerAlertPanel';
import { HealthRing } from '../HealthRing';
import type { HealthBreakdown } from '../HealthRing';
import { timeAgo } from '../admin-utils';
import type { TracerSubTab, TracerAlert, TracerActivityEvent } from './tracer-types';

// ============================================================================
// TYPES
// ============================================================================

interface TracerHealthOverviewProps {
  healthScore: number;
  healthBreakdown: {
    completionScore: number;
    qualityScore: number;
    errorScore: number;
  };
  totalRounds: number;
  completedRounds: number;
  completionRate: number;
  errors7d: number;
  critical7d: number;
  statsMismatches: number;
  alerts: TracerAlert[];
  activityFeed: TracerActivityEvent[];
  sparklineData?: { rounds: number[]; errors: number[] };
  onNavigate: (tab: TracerSubTab) => void;
}

// ============================================================================
// ACTIVITY TYPE CONFIG
// ============================================================================

const ACTIVITY_CONFIG: Record<
  string,
  { icon: typeof IconCheckCircle2; color: string; bg: string; label: string }
> = {
  round_started: {
    icon: IconCircleDot,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    label: 'Started round',
  },
  round_completed: {
    icon: IconCheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50',
    label: 'Completed round',
  },
  round_error: {
    icon: IconXCircle,
    color: 'text-red-500',
    bg: 'bg-red-50',
    label: 'Error on submit',
  },
  detail_warning: {
    icon: IconWarning,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    label: 'Detail warning',
  },
};

// ============================================================================
// ACTIVITY ROW
// ============================================================================

function ActivityRow({ event }: { event: TracerActivityEvent }) {
  const cfg = ACTIVITY_CONFIG[event.type] ?? ACTIVITY_CONFIG.round_started!;
  const Icon = cfg.icon;

  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-white/40 transition-colors">
      {/* Icon */}
      <div
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          cfg.bg
        )}
      >
        <Icon size={14} className={cfg.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-warm-900">
            {event.player_name}
          </span>
          <span className="text-xs text-warm-500">{cfg.label}</span>
          {event.course_name && (
            <>
              <span className="text-warm-300 text-xs">at</span>
              <span className="text-xs text-warm-600">{event.course_name}</span>
            </>
          )}
          {event.score != null && (
            <span className="text-xs font-semibold text-warm-700 tabular-nums">
              {event.score}
              {event.score_to_par != null && (
                <span
                  className={cn(
                    'ml-0.5',
                    event.score_to_par > 0
                      ? 'text-red-500'
                      : event.score_to_par < 0
                        ? 'text-green-600'
                        : 'text-warm-400'
                  )}
                >
                  ({event.score_to_par > 0 ? '+' : ''}
                  {event.score_to_par})
                </span>
              )}
            </span>
          )}
        </div>
        {event.error_message && (
          <p className="text-xs text-red-500 mt-1 leading-relaxed">
            {event.error_message}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[11px] text-warm-400 flex-shrink-0 tabular-nums mt-0.5">
        {timeAgo(event.timestamp)}
      </span>
    </div>
  );
}

// ============================================================================
// TRACER HEALTH OVERVIEW
// ============================================================================

export default function TracerHealthOverview({
  healthScore,
  healthBreakdown,
  totalRounds,
  completedRounds,
  completionRate,
  errors7d,
  critical7d,
  statsMismatches,
  alerts,
  activityFeed,
  sparklineData,
  onNavigate,
}: TracerHealthOverviewProps) {
  // Build breakdown items for HealthRing
  const breakdown: HealthBreakdown[] = [
    {
      label: 'Completion',
      value: healthBreakdown.completionScore,
      max: 100,
      color: '#10B981',
      onClick: () => onNavigate('rounds'),
    },
    {
      label: 'Quality',
      value: healthBreakdown.qualityScore,
      max: 100,
      color: '#3B82F6',
      onClick: () => onNavigate('quality'),
    },
    {
      label: 'Errors',
      value: healthBreakdown.errorScore,
      max: 100,
      color: '#F59E0B',
      onClick: () => onNavigate('errors'),
    },
  ];

  const recentActivity = activityFeed.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. KPI Cards                                                       */}
      {/* ------------------------------------------------------------------ */}
      <TracerKPICards
        totalRounds={totalRounds}
        completedRounds={completedRounds}
        completionRate={completionRate}
        errors7d={errors7d}
        critical7d={critical7d}
        statsMismatches={statsMismatches}
        sparklineData={sparklineData}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. Health Ring + Alert Panel — 2-column grid                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Health Ring (1 col) */}
        <div>
          <HealthRing
            score={healthScore}
            breakdown={breakdown}
            label="Health Score"
            sublabel="Completion 40% · Quality 30% · Errors 30%"
          />
        </div>

        {/* Right column: Alert Panel (2 cols) */}
        <div className="lg:col-span-2">
          <TracerAlertPanel alerts={alerts} onNavigate={onNavigate} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Recent Activity Timeline                                        */}
      {/* ------------------------------------------------------------------ */}
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className={cn(
          'bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]',
          'overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-warm-900 uppercase tracking-wider">
            Recent Activity
          </h3>
        </div>

        {/* Activity list */}
        {recentActivity.length === 0 ? (
          <div className="px-5 pb-6 text-center">
            <p className="text-warm-400 text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-warm-100/50 max-h-[380px] overflow-y-auto">
            {recentActivity.map((event, i) => (
              <ActivityRow
                key={`${event.timestamp}-${event.type}-${i}`}
                event={event}
              />
            ))}
          </div>
        )}
      </m.div>
    </div>
  );
}
