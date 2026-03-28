'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IconCrosshair, IconMessageSquare, IconTarget, IconFlag } from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';

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
  lead: { label: 'Leads', icon: <IconCrosshair size={14} />, color: 'from-warm-400 to-warm-500' },
  active: { label: 'Active', icon: <IconMessageSquare size={14} />, color: 'from-blue-400 to-blue-500' },
  closing: { label: 'Closing', icon: <IconTarget size={14} />, color: 'from-purple-400 to-purple-500' },
  closed: { label: 'Closed', icon: <IconFlag size={14} />, color: 'from-primary-400 to-primary-500' },
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
      <div className="bg-white rounded-xl border border-warm-200 p-6">
        <h3 className="text-sm font-semibold text-warm-700 mb-4">Sales Pipeline</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['lead', 'active', 'closing', 'closed'] as const).map((stage, index) => {
            const config = STAGE_CONFIG[stage];
            const stats = stageStats[stage] ?? { count: 0, statuses: {} };
            const width = coaches.length > 0 ? (stats.count / coaches.length) * 100 : 0;

            return (
              <div key={stage} className="relative">
                <div className={cn(
                  'rounded-xl p-4 bg-gradient-to-br text-white relative overflow-hidden',
                  config.color
                )}>
                  {/* Background pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/20" />
                    <div className="absolute -right-2 -bottom-2 w-16 h-16 rounded-full bg-white/10" />
                  </div>

                  <div className="relative">
                    <div className="text-3xl font-bold">{stats.count}</div>
                    <div className="text-sm opacity-90 font-medium">
                      {config.icon} {config.label}
                    </div>
                  </div>

                  {/* Progress indicator */}
                  <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/60 rounded-full transition-all duration-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>

                {/* Stage breakdown */}
                {Object.keys(stats.statuses).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(stats.statuses)
                      .sort((a, b) => (statusConfig[a[0] as CoachStatus]?.order || 0) - (statusConfig[b[0] as CoachStatus]?.order || 0))
                      .map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between text-xs">
                          <span className="text-warm-500 truncate">
                            {statusConfig[status as CoachStatus]?.label}
                          </span>
                          <span className="text-warm-700 font-medium ml-2">{count}</span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Arrow connector — hidden on mobile */}
                {index < 3 && (
                  <div className="absolute right-0 top-1/3 translate-x-1/2 -translate-y-1/2 text-warm-300 text-xl z-10 hidden lg:flex items-center justify-center">
                    →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-warm-200 p-4">
          <div className="text-xs text-warm-500 mb-1">Total Coaches</div>
          <div className="text-2xl font-bold text-warm-900">{coaches.length}</div>
        </div>

        <div className="bg-white rounded-xl border border-warm-200 p-4">
          <div className="text-xs text-warm-500 mb-1">D2 / D3</div>
          <div className="text-2xl font-bold text-warm-900">
            <span className="text-blue-600">{divisionStats.d2}</span>
            <span className="text-warm-300 mx-1">/</span>
            <span className="text-purple-600">{divisionStats.d3}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-warm-200 p-4">
          <div className="text-xs text-warm-500 mb-1">Conversion</div>
          <div className="text-2xl font-bold text-primary-600">{conversionRate}%</div>
        </div>

        <div className={cn(
          'rounded-xl border p-4',
          followUpsDue > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-warm-200'
        )}>
          <div className="text-xs text-warm-500 mb-1">Follow-ups Due</div>
          <div className={cn(
            'text-2xl font-bold',
            followUpsDue > 0 ? 'text-orange-600' : 'text-warm-900'
          )}>
            {followUpsDue}
          </div>
        </div>

        <div className={cn(
          'rounded-xl border p-4',
          hotLeads > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-warm-200'
        )}>
          <div className="text-xs text-warm-500 mb-1">Hot Leads</div>
          <div className={cn(
            'text-2xl font-bold',
            hotLeads > 0 ? 'text-red-600' : 'text-warm-900'
          )}>
            {hotLeads}
          </div>
        </div>
      </div>
    </div>
  );
}
