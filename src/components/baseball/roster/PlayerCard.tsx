'use client';

import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconChart,
  IconMessage,
  IconMapPin,
} from '@/components/icons';
import type { BaseballPlayerAggregates } from '@/lib/types';

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

interface PlayerCardProps {
  player: PlayerData;
  jerseyNumber: number | null;
  status: MemberStatus | null;
  aggregates?: BaseballPlayerAggregates;
  onMessage?: (playerId: string) => void;
}

// Format batting average
function formatAvg(avg: number | null | undefined): string {
  if (avg == null) return '---';
  return avg.toFixed(3).replace('0.', '.');
}

// Format OBP
function formatOBP(obp: number | null | undefined): string {
  if (obp == null) return '---';
  return obp.toFixed(3).replace('0.', '.');
}

// Format SLG
function formatSLG(slg: number | null | undefined): string {
  if (slg == null) return '---';
  return slg.toFixed(3).replace('0.', '.');
}

// Format OPS
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

// Get status badge
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

export function PlayerCard({
  player,
  jerseyNumber,
  status,
  aggregates,
  onMessage,
}: PlayerCardProps) {
  const router = useRouter();
  const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';

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
          <div className="flex items-center gap-1 text-warm-400">
            <IconMinus size={14} />
            <span className="text-xs font-medium">Stable</span>
          </div>
        );
    }
  };

  const handleCardClick = () => {
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

  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-cream-50 rounded-2xl border border-warm-200 p-4 shadow-sm hover:shadow-md hover:border-warm-300 active:scale-[0.98] transition-all duration-200 cursor-pointer"
      onClick={handleCardClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
    >
      {/* Player header with avatar + name */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <Avatar
            name={fullName}
            src={player.avatar_url || undefined}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-warm-900 truncate">{fullName}</h3>
              {jerseyNumber && (
                <span className="text-xs bg-warm-100 text-warm-600 px-1.5 py-0.5 rounded flex-shrink-0">
                  #{jerseyNumber}
                </span>
              )}
            </div>
            <p className="text-sm text-warm-500">
              {player.primary_position || 'N/A'}
              {player.secondary_position && ` / ${player.secondary_position}`}
              {player.grad_year ? ` • '${String(player.grad_year).slice(-2)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {getStatusBadge(status)}
          {getTrendIndicator()}
        </div>
      </div>

      {/* Stats Grid */}
      {aggregates && (aggregates.career_avg != null || aggregates.total_sessions) ? (
        <>
          {/* Slash Line Header */}
          <div className="bg-warm-50 rounded-lg p-2 mb-2">
            <p className="text-xs text-warm-500 mb-0.5 text-center">Slash Line (AVG/OBP/SLG/OPS)</p>
            <p className="text-sm font-semibold text-warm-900 tabular-nums text-center tracking-wide">
              {formatAvg(aggregates.career_avg)} / {formatOBP(aggregates.career_obp)} / {formatSLG(aggregates.career_slg)} / {formatOPS(aggregates.career_ops)}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-2">
            <div className="bg-warm-50 rounded-lg p-2 text-center">
              <p className="text-xs text-warm-500 mb-0.5">OPS</p>
              <p
                className={`text-base font-semibold tabular-nums ${
                  aggregates.career_ops != null && aggregates.career_ops >= 0.8
                    ? 'text-primary-600'
                    : aggregates.career_ops != null && aggregates.career_ops >= 0.7
                      ? 'text-warm-900'
                      : 'text-warm-600'
                }`}
              >
                {formatOPS(aggregates.career_ops)}
              </p>
            </div>
            <div className="bg-warm-50 rounded-lg p-2 text-center">
              <p className="text-xs text-warm-500 mb-0.5">Exit V</p>
              <p className="text-base font-semibold text-warm-900 tabular-nums">
                {formatExitVelo(aggregates.avg_exit_velocity)}
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
        </>
      ) : (
        <div className="bg-warm-50 rounded-lg p-3 mb-3 text-center">
          <p className="text-sm text-warm-500">No stats uploaded yet</p>
        </div>
      )}

      {/* Location */}
      {(player.city || player.state) && (
        <p className="flex items-center gap-1 text-xs text-warm-500 mb-3">
          <IconMapPin size={12} className="shrink-0 text-warm-400" />
          {player.city && player.state ? `${player.city}, ${player.state}` : player.city || player.state}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 min-h-[44px]"
          onClick={handleViewStats}
        >
          <IconChart size={16} className="mr-2" />
          Stats
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 min-h-[44px]"
          onClick={handleMessage}
        >
          <IconMessage size={16} className="mr-2" />
          Message
        </Button>
      </div>
    </div>
  );
}
