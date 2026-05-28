'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  IconChevronRight,
  IconMessage,
  IconChart,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconUser,
} from '@/components/icons';
import type { BaseballPlayerAggregates } from '@/lib/types';
import { IconButton } from '@/components/ui/button';

type MemberStatus = 'pending' | 'active' | 'inactive' | 'removed' | 'injured' | 'alumni';

interface PlayerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  recruiting_activated: boolean | null;
}

interface PlayerRowProps {
  memberId: string;
  player: PlayerData;
  jerseyNumber: number | null;
  status: MemberStatus | null;
  aggregates?: BaseballPlayerAggregates;
  onMessage?: (playerId: string) => void;
  compact?: boolean;
}

// Format batting average (e.g., .345)
function formatAvg(avg: number | null | undefined): string {
  if (avg == null) return '---';
  return avg.toFixed(3).replace('0.', '.');
}

// Format OBP (e.g., .420)
function formatOBP(obp: number | null | undefined): string {
  if (obp == null) return '---';
  return obp.toFixed(3).replace('0.', '.');
}

// Format SLG (e.g., .520)
function formatSLG(slg: number | null | undefined): string {
  if (slg == null) return '---';
  return slg.toFixed(3).replace('0.', '.');
}

// Format OPS (e.g., .920)
function formatOPS(ops: number | null | undefined): string {
  if (ops == null) return '---';
  // OPS can be >= 1.000
  if (ops >= 1) return ops.toFixed(3);
  return ops.toFixed(3).replace('0.', '.');
}

// Format exit velocity
function formatExitVelo(velo: number | null | undefined): string {
  if (velo == null) return '---';
  return `${velo.toFixed(1)}`;
}

// Get status badge variant
function getStatusBadge(status: MemberStatus | null) {
  switch (status) {
    case 'active':
      return <Badge variant="success">Active</Badge>;
    case 'inactive':
      return <Badge variant="secondary">Inactive</Badge>;
    case 'injured':
      return <Badge variant="warning">Injured</Badge>;
    case 'alumni':
      return <Badge variant="secondary">Alumni</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    default:
      return null;
  }
}

export function PlayerRow({
  player,
  jerseyNumber,
  status,
  aggregates,
  onMessage,
  compact = false,
}: PlayerRowProps) {
  const router = useRouter();
  const [showPreview, setShowPreview] = useState(false);

  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';

  // Trend indicator
  const getTrendIcon = () => {
    const trend = aggregates?.recent_trend;
    if (!trend) return null;

    switch (trend) {
      case 'improving':
        return <IconTrendingUp size={14} className="text-primary-600" />;
      case 'declining':
        return <IconTrendingDown size={14} className="text-red-500" />;
      case 'stable':
        return <IconMinus size={14} className="text-warm-400" />;
      default:
        return null;
    }
  };

  const handleRowClick = () => {
    router.push(`/baseball/dashboard/players/${player.id}`);
  };

  const handleViewStats = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/baseball/dashboard/players/${player.id}/stats`);
  };

  const handleMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMessage) {
      onMessage(player.id);
    } else {
      router.push(`/baseball/dashboard/messages?player=${player.id}`);
    }
  };

  const handleViewProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/baseball/dashboard/players/${player.id}`);
  };

  return (
    <tr
      className="hover:bg-warm-50 active:bg-warm-100 transition-colors cursor-pointer group relative"
      onClick={handleRowClick}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      {/* Player Info */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <Avatar
            name={fullName}
            src={player.avatar_url || undefined}
            size="sm"
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-warm-900">{fullName}</p>
              {jerseyNumber && (
                <span className="text-xs bg-warm-100 text-warm-600 px-1.5 py-0.5 rounded">
                  #{jerseyNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-warm-500">{player.email}</p>
          </div>
        </div>
      </td>

      {/* Position */}
      <td className="py-4 px-4 text-sm text-warm-600">
        <span className="font-medium">{player.primary_position || '-'}</span>
        {player.secondary_position && (
          <span className="text-warm-400"> / {player.secondary_position}</span>
        )}
      </td>

      {/* Grad Year */}
      <td className="py-4 px-4 text-sm text-warm-600">
        {player.grad_year ? `'${String(player.grad_year).slice(-2)}` : '-'}
      </td>

      {/* AVG */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-warm-900 tabular-nums">
            {formatAvg(aggregates?.career_avg)}
          </span>
          {getTrendIcon()}
        </div>
      </td>

      {/* OBP */}
      <td className="py-4 px-4 text-sm text-warm-600 tabular-nums">
        {formatOBP(aggregates?.career_obp)}
      </td>

      {/* SLG */}
      <td className="py-4 px-4 text-sm text-warm-600 tabular-nums">
        {formatSLG(aggregates?.career_slg)}
      </td>

      {/* OPS */}
      <td className="py-4 px-4">
        <span
          className={`text-sm font-semibold tabular-nums ${
            aggregates?.career_ops != null && aggregates.career_ops >= 0.8
              ? 'text-primary-600'
              : aggregates?.career_ops != null && aggregates.career_ops >= 0.7
                ? 'text-warm-900'
                : 'text-warm-600'
          }`}
        >
          {formatOPS(aggregates?.career_ops)}
        </span>
      </td>

      {/* Last 5 AVG - Hidden in compact mode */}
      {!compact && (
        <td className="py-4 px-4 text-sm text-warm-600 tabular-nums">
          {formatAvg(aggregates?.last_5_avg)}
        </td>
      )}

      {/* Exit Velo - Hidden in compact mode */}
      {!compact && (
        <td className="py-4 px-4 text-sm text-warm-600 tabular-nums">
          {aggregates?.avg_exit_velocity ? (
            <span>
              {formatExitVelo(aggregates.avg_exit_velocity)}
              <span className="text-warm-400 text-xs ml-0.5">mph</span>
            </span>
          ) : (
            '---'
          )}
        </td>
      )}

      {/* Sessions - Hidden in compact mode */}
      {!compact && (
        <td className="py-4 px-4 text-sm text-warm-600 tabular-nums">
          {aggregates?.total_sessions ?? 0}
        </td>
      )}

      {/* Status */}
      <td className="py-4 px-4">{getStatusBadge(status)}</td>

      {/* Actions */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton variant="primary" aria-label="Chart"
            onClick={handleViewStats}
            className="p-2 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="View Stats"
          >
            <IconChart size={16} />
          </IconButton>
          <IconButton variant="primary" aria-label="Message"
            onClick={handleMessage}
            className="p-2 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="Message"
          >
            <IconMessage size={16} />
          </IconButton>
          <IconButton variant="primary" aria-label="Profile"
            onClick={handleViewProfile}
            className="p-2 rounded-lg text-warm-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="View Profile"
          >
            <IconUser size={16} />
          </IconButton>
          <IconChevronRight
            size={16}
            className="text-warm-300 group-hover:text-warm-500 transition-colors ml-1"
          />
        </div>
      </td>

      {/* Hover Preview Card */}
      {showPreview && aggregates && (
        <td className="absolute right-full top-1/2 -translate-y-1/2 mr-2 z-50 pointer-events-none">
          <div className="bg-white rounded-xl shadow-xl border border-warm-200 p-4 w-64 animate-in fade-in slide-in-from-right-2 duration-150">
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-warm-100">
              <Avatar name={fullName} src={player.avatar_url || undefined} size="md" />
              <div>
                <p className="font-semibold text-warm-900">{fullName}</p>
                <p className="text-xs text-warm-500">
                  {player.primary_position} • Class of {player.grad_year}
                </p>
              </div>
            </div>

            {/* Slash Line Stats */}
            <div className="bg-warm-50 rounded-lg p-2 mb-2">
              <p className="text-xs text-warm-500 mb-1 text-center">Slash Line</p>
              <p className="text-sm font-semibold text-warm-900 tabular-nums text-center tracking-wide">
                {formatAvg(aggregates.career_avg)} / {formatOBP(aggregates.career_obp)} / {formatSLG(aggregates.career_slg)} / {formatOPS(aggregates.career_ops)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-warm-50 rounded-lg p-2 text-center">
                <p className="text-xs text-warm-500 mb-0.5">OPS</p>
                <p
                  className={`text-base font-semibold tabular-nums ${
                    aggregates.career_ops != null && aggregates.career_ops >= 0.8
                      ? 'text-primary-600'
                      : 'text-warm-900'
                  }`}
                >
                  {formatOPS(aggregates.career_ops)}
                </p>
              </div>
              <div className="bg-warm-50 rounded-lg p-2 text-center">
                <p className="text-xs text-warm-500 mb-0.5">Last 5</p>
                <p className="text-base font-semibold text-warm-900 tabular-nums">
                  {formatAvg(aggregates.last_5_avg)}
                </p>
              </div>
              <div className="bg-warm-50 rounded-lg p-2 text-center">
                <p className="text-xs text-warm-500 mb-0.5">Sessions</p>
                <p className="text-base font-semibold text-warm-900 tabular-nums">
                  {aggregates.total_sessions ?? 0}
                </p>
              </div>
            </div>

            {aggregates.pressure_gap != null && (
              <div className="flex items-center justify-between text-xs border-t border-warm-100 pt-2">
                <span className="text-warm-500">Practice → Game</span>
                <span
                  className={`font-medium ${
                    aggregates.pressure_gap >= 0 ? 'text-primary-600' : 'text-red-500'
                  }`}
                >
                  {formatAvg(aggregates.practice_avg)} → {formatAvg(aggregates.game_avg)}
                </span>
              </div>
            )}

            {aggregates.avg_exit_velocity && (
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-warm-500">Avg Exit Velo</span>
                <span className="font-medium text-warm-900">
                  {formatExitVelo(aggregates.avg_exit_velocity)} mph
                </span>
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
