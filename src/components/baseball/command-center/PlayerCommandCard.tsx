'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import type { BaseballRosterPlayer } from '@/lib/types';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconAlertCircle,
  IconChevronRight,
} from '@/components/icons';

interface PlayerCommandCardProps {
  player: BaseballRosterPlayer & {
    jersey_number?: number | null;
    team_position?: string | null;
    team_status?: string | null;
  };
}

export function PlayerCommandCard({ player }: PlayerCommandCardProps) {
  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  const aggregates = player.aggregates;
  const hasInsights = (player.insights?.length ?? 0) > 0;
  const urgentInsights = player.insights?.filter((i) => i.priority === 'urgent' || i.priority === 'high').length ?? 0;

  // Trend indicator
  const getTrendIndicator = () => {
    const trend = aggregates?.recent_trend;
    if (!trend) return null;

    switch (trend) {
      case 'improving':
        return (
          <div className="flex items-center gap-1 text-primary-600">
            <IconTrendingUp size={14} />
            <span className="text-xs font-medium">Improving</span>
          </div>
        );
      case 'declining':
        return (
          <div className="flex items-center gap-1 text-red-500">
            <IconTrendingDown size={14} />
            <span className="text-xs font-medium">Declining</span>
          </div>
        );
      case 'stable':
        return (
          <div className="flex items-center gap-1 text-slate-400">
            <IconMinus size={14} />
            <span className="text-xs font-medium">Stable</span>
          </div>
        );
    }
  };

  // Format batting average
  const formatAvg = (avg: number | null | undefined) => {
    if (avg == null) return '---';
    return avg.toFixed(3).replace('0.', '.');
  };

  // Format percentage change
  const formatPressureGap = (gap: number | null | undefined) => {
    if (gap == null) return null;
    const prefix = gap >= 0 ? '+' : '';
    return `${prefix}${(gap * 1000).toFixed(0)} pts`;
  };

  return (
    <Link href={`/baseball/dashboard/players/${player.id}`}>
      <div
        className="glass-standard rounded-xl p-4
                   hover:bg-white/80 hover:-translate-y-0.5 hover:shadow-lg
                   transition-all duration-200 cursor-pointer group"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar
              src={player.avatar_url}
              name={fullName}
              size="md"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">{fullName}</h3>
                {player.jersey_number && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    #{player.jersey_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>{player.primary_position || 'Position N/A'}</span>
                {player.grad_year && (
                  <>
                    <span className="text-slate-300">&middot;</span>
                    <span>&apos;{String(player.grad_year).slice(-2)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trend + Alert */}
          <div className="flex flex-col items-end gap-1">
            {getTrendIndicator()}
            {hasInsights && (
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  urgentInsights > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <IconAlertCircle size={12} />
                {player.insights?.length} {player.insights?.length === 1 ? 'insight' : 'insights'}
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-xs text-slate-500 mb-0.5">AVG</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatAvg(aggregates?.career_avg)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-xs text-slate-500 mb-0.5">Last 5</p>
            <p className="text-lg font-semibold text-slate-900">
              {formatAvg(aggregates?.last_5_avg)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-xs text-slate-500 mb-0.5">Sessions</p>
            <p className="text-lg font-semibold text-slate-900">
              {aggregates?.total_sessions ?? 0}
            </p>
          </div>
        </div>

        {/* Pressure Performance */}
        {aggregates?.pressure_gap != null && (
          <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
            <span className="text-slate-500">Practice vs Game</span>
            <span
              className={`font-medium ${
                aggregates.pressure_gap >= 0 ? 'text-primary-600' : 'text-red-500'
              }`}
            >
              {formatPressureGap(aggregates.pressure_gap)}
              <span className="text-slate-400 ml-1">
                ({formatAvg(aggregates.practice_avg)} → {formatAvg(aggregates.game_avg)})
              </span>
            </span>
          </div>
        )}

        {/* View Arrow */}
        <div className="flex items-center justify-end mt-2 text-slate-400 group-hover:text-primary-600 transition-colors">
          <span className="text-xs mr-1">View Profile</span>
          <IconChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}
