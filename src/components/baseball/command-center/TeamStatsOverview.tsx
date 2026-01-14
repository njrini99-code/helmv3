'use client';

import type { BaseballCoachInsight } from '@/lib/types';
import {
  IconUsers,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
} from '@/components/icons';

interface TeamStatsOverviewProps {
  totalPlayers: number;
  improvingCount: number;
  decliningCount: number;
  needsAttentionCount: number;
  insights: BaseballCoachInsight[];
}

export function TeamStatsOverview({
  totalPlayers,
  improvingCount,
  decliningCount,
  needsAttentionCount,
  insights,
}: TeamStatsOverviewProps) {
  const urgentInsights = insights.filter(
    (i) => i.priority === 'urgent' || i.priority === 'high'
  ).length;

  const stats = [
    {
      label: 'Total Players',
      value: totalPlayers,
      icon: IconUsers,
      color: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Improving',
      value: improvingCount,
      icon: IconTrendingUp,
      color: 'bg-green-100 text-green-600',
      delta: totalPlayers > 0 ? `${Math.round((improvingCount / totalPlayers) * 100)}%` : null,
    },
    {
      label: 'Declining',
      value: decliningCount,
      icon: IconTrendingDown,
      color: 'bg-red-100 text-red-600',
      delta: totalPlayers > 0 ? `${Math.round((decliningCount / totalPlayers) * 100)}%` : null,
    },
    {
      label: 'Need Attention',
      value: needsAttentionCount,
      icon: IconAlertCircle,
      color: urgentInsights > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500',
      highlight: urgentInsights > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4
                     ${stat.highlight ? 'ring-2 ring-amber-300 ring-offset-2' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center`}>
              <stat.icon size={18} />
            </div>
            {stat.delta && (
              <span className="text-xs text-slate-500">{stat.delta}</span>
            )}
          </div>
          <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
          <p className="text-sm text-slate-500">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
