'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconCrosshair, IconMessageSquare, IconTarget, IconFlag, IconArrowRight } from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';
import { STATUS_COLORS } from '../crm-config';

interface PipelineStatsProps {
  coaches: Coach[];
  statusConfig: Record<CoachStatus, {
    label: string;
    color: string;
    bgColor: string;
    stage?: string;
    order: number;
  }>;
}

const STAGE_CONFIG = {
  lead: { label: 'Leads', icon: <IconCrosshair size={16} />, gradient: 'from-warm-400 to-warm-500', iconBg: 'bg-warm-100', iconColor: 'text-warm-600' },
  active: { label: 'Active', icon: <IconMessageSquare size={16} />, gradient: 'from-blue-400 to-violet-500', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
  closing: { label: 'Closing', icon: <IconTarget size={16} />, gradient: 'from-amber-400 to-orange-500', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  closed: { label: 'Closed', icon: <IconFlag size={16} />, gradient: 'from-primary-400 to-primary-600', iconBg: 'bg-primary-100', iconColor: 'text-primary-600' },
};

export function PipelineStats({ coaches, statusConfig }: PipelineStatsProps) {
  const stageStats = useMemo(() => {
    const stages: Record<string, { count: number; statuses: Record<CoachStatus, number> }> = {
      lead: { count: 0, statuses: {} as Record<CoachStatus, number> },
      active: { count: 0, statuses: {} as Record<CoachStatus, number> },
      closing: { count: 0, statuses: {} as Record<CoachStatus, number> },
      closed: { count: 0, statuses: {} as Record<CoachStatus, number> },
    };

    coaches.forEach(coach => {
      const stage = statusConfig[coach.status]?.stage || 'lead';
      const stageData = stages[stage];
      if (stageData) {
        stageData.count++;
        stageData.statuses[coach.status] = (stageData.statuses[coach.status] || 0) + 1;
      }
    });

    return stages;
  }, [coaches, statusConfig]);

  const divisionStats = useMemo(() => {
    const d2 = coaches.filter(c => c.division === 'D2').length;
    const d3 = coaches.filter(c => c.division === 'D3').length;
    return { d2, d3 };
  }, [coaches]);

  const conversionRate = useMemo(() => {
    const won = coaches.filter(c => c.status === 'won').length;
    return coaches.length > 0 ? ((won / coaches.length) * 100).toFixed(1) : '0';
  }, [coaches]);

  const followUpsDue = useMemo(() => {
    const now = new Date();
    return coaches.filter(c => c.next_follow_up_at && new Date(c.next_follow_up_at) <= now).length;
  }, [coaches]);

  const hotLeads = useMemo(() => {
    return coaches.filter(c => c.priority >= 2).length;
  }, [coaches]);

  return (
    <div className="space-y-4">
      {/* Stage Pipeline */}
      <div className="glass-standard rounded-2xl p-6">
        <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-4">Sales Pipeline</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['lead', 'active', 'closing', 'closed'] as const).map((stage, index) => {
            const config = STAGE_CONFIG[stage];
            const stats = stageStats[stage] ?? { count: 0, statuses: {} };
            const width = coaches.length > 0 ? (stats.count / coaches.length) * 100 : 0;

            return (
              <div key={stage} className="relative">
                <div className="glass-standard rounded-2xl p-4 relative overflow-hidden hover:bg-cream-100 transition-colors">
                  {/* Color accent bar at top */}
                  <div className={cn('absolute top-0 left-0 right-0 h-1 bg-gradient-to-r', config.gradient)} aria-hidden="true" />

                  <div className="relative pt-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', config.iconBg, config.iconColor)} aria-hidden="true">
                        {config.icon}
                      </div>
                      <span className="text-xs font-semibold text-warm-500 uppercase tracking-wider">{config.label}</span>
                    </div>
                    <div className="text-3xl font-bold text-warm-900 tabular-nums">{stats.count}</div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 bg-warm-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500 bg-gradient-to-r', config.gradient)}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>

                {/* Stage breakdown */}
                {Object.keys(stats.statuses).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(stats.statuses)
                      .sort((a, b) => (statusConfig[a[0] as CoachStatus]?.order || 0) - (statusConfig[b[0] as CoachStatus]?.order || 0))
                      .map(([status, count]) => {
                        const colors = STATUS_COLORS[status as CoachStatus];
                        return (
                          <div key={status} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', colors?.dot)} aria-hidden="true" />
                              <span className="text-warm-500 truncate">
                                {statusConfig[status as CoachStatus]?.label}
                              </span>
                            </span>
                            <span className="text-warm-700 font-medium ml-2 tabular-nums">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Arrow connector */}
                {index < 3 && (
                  <div className="absolute right-0 top-1/3 translate-x-1/2 -translate-y-1/2 z-10 hidden lg:flex items-center justify-center" aria-hidden="true">
                    <IconArrowRight size={14} className="text-warm-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="glass-standard rounded-2xl p-4 hover:bg-cream-100 transition-colors">
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1">Total Coaches</div>
          <div className="text-2xl font-bold text-warm-900 tabular-nums">{coaches.length}</div>
        </div>

        <div className="glass-standard rounded-2xl p-4 hover:bg-cream-100 transition-colors">
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1">D2 / D3</div>
          <div className="text-2xl font-bold tabular-nums">
            <span className="text-blue-600">{divisionStats.d2}</span>
            <span className="text-warm-300 mx-1">/</span>
            <span className="text-primary-700">{divisionStats.d3}</span>
          </div>
        </div>

        <div className="glass-standard rounded-2xl p-4 hover:bg-cream-100 transition-colors">
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1">Conversion</div>
          <div className="text-2xl font-bold text-primary-600 tabular-nums">{conversionRate}%</div>
        </div>

        <div className={cn(
          'rounded-2xl p-4 transition-colors',
          followUpsDue > 0
            ? 'bg-orange-50/70 backdrop-blur-xl border border-orange-200/50'
            : 'glass-standard hover:bg-cream-100'
        )}>
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1">Follow-ups Due</div>
          <div className={cn(
            'text-h1 md:text-h1 font-light tabular-nums tracking-[-0.025em]',
            followUpsDue > 0 ? 'text-orange-600' : 'text-warm-900'
          )}>
            {followUpsDue}
          </div>
        </div>

        <div className={cn(
          'rounded-2xl p-4 transition-colors',
          hotLeads > 0
            ? 'bg-red-50/70 backdrop-blur-xl border border-red-200/50'
            : 'glass-standard hover:bg-cream-100'
        )}>
          <div className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-1">Hot Leads</div>
          <div className={cn(
            'text-h1 md:text-h1 font-light tabular-nums tracking-[-0.025em]',
            hotLeads > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {hotLeads}
          </div>
        </div>
      </div>
    </div>
  );
}
