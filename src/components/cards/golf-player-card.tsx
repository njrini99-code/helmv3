'use client';

import { useState } from 'react';
import {
  EyeIcon,
  MessageSquareIcon,
  GitCompareIcon,
  MoreHorizontalIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  MinusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardActionsMenu, type CardAction } from './card-actions-menu';
import { MiniRoundsChart } from './mini-rounds-chart';
import type { GolfPlayer, CardVariant } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface GolfPlayerCardProps {
  player: GolfPlayer;
  variant?: CardVariant;
  selected?: boolean;
  onSelect?: () => void;
  onView?: () => void;
  onMessage?: () => void;
  onCompare?: () => void;
  showActions?: boolean;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function GolfPlayerCard({
  player,
  variant = 'standard',
  selected = false,
  onSelect,
  onView,
  onMessage,
  onCompare,
  showActions = true,
  className,
}: GolfPlayerCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  // Handicap trend
  const handicapTrend = player.handicap_change || 0;
  const TrendIcon =
    handicapTrend < 0
      ? TrendingDownIcon
      : handicapTrend > 0
      ? TrendingUpIcon
      : MinusIcon;
  const trendColor =
    handicapTrend < 0
      ? 'text-primary-600'
      : handicapTrend > 0
      ? 'text-red-500'
      : 'text-warm-400';

  // Size variants
  const sizeClasses = {
    full: 'w-[320px]',
    standard: 'w-[280px]',
    compact: 'w-[240px]',
    mini: 'w-[200px]',
  };

  const avatarSizes = {
    full: 'w-20 h-20',
    standard: 'w-16 h-16',
    compact: 'w-14 h-14',
    mini: 'w-12 h-12',
  };

  // Actions
  const actions: CardAction[] = [
    { label: 'View Full Stats', onClick: () => {} },
    { label: 'Export Profile', onClick: () => {} },
    { label: 'Share', onClick: () => {} },
  ];

  return (
    <div
      className={cn(
        // Base card styles (Glass effect)
        'relative',
        'bg-white/70 backdrop-blur-md',
        'border rounded-[20px]',
        'transition-all duration-200',

        // Size
        sizeClasses[variant],

        // Border & shadow states
        selected
          ? 'border-primary-400 shadow-lg ring-2 ring-primary-200'
          : 'border-white/40 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-white/60',

        // Cursor
        onSelect && 'cursor-pointer',

        className
      )}
      onClick={onSelect}
    >
      {/* ============================================ */}
      {/* HEADER: Avatar + Basic Info */}
      {/* ============================================ */}
      <div className={cn('flex gap-3', variant === 'mini' ? 'p-3' : 'p-4')}>
        {/* Avatar */}
        <div
          className={cn(
            'rounded-[10px] overflow-hidden flex-shrink-0 bg-warm-100',
            avatarSizes[variant]
          )}
        >
          {player.avatar_url ? (
            <img
              src={player.avatar_url}
              alt={`${player.first_name} ${player.last_name}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-warm-500 font-bold text-lg">
              {player.first_name?.[0]}
              {player.last_name?.[0]}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'font-bold text-warm-900 truncate',
              variant === 'mini' ? 'text-sm' : 'text-base'
            )}
          >
            {player.first_name} {player.last_name}
          </h3>

          <p className="text-xs text-warm-500 mt-0.5">
            {player.academic_year} • {player.team_name || 'Free Agent'}
          </p>

          {variant !== 'mini' && player.hometown && (
            <p className="text-xs text-warm-400 mt-0.5 truncate">{player.hometown}</p>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* HANDICAP DISPLAY (Prominent) */}
      {/* ============================================ */}
      {variant !== 'mini' && (
        <div className="px-4 pb-3">
          <div
            className="
            flex items-center justify-between
            bg-gradient-to-r from-primary-50 to-primary-100/50
            rounded-[12px] px-4 py-3
          "
          >
            <div>
              <div className="text-2xl font-bold text-warm-900">
                {player.handicap !== null && player.handicap !== undefined
                  ? (player.handicap > 0 ? '+' : '') + player.handicap.toFixed(1)
                  : '—'}
              </div>
              <div className="text-xs text-warm-500">Handicap</div>
            </div>

            {handicapTrend !== 0 && (
              <div className={cn('flex items-center gap-1', trendColor)}>
                <TrendIcon className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {Math.abs(handicapTrend).toFixed(1)}
                </span>
                <span className="text-xs text-warm-400">this month</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STATS GRID */}
      {/* ============================================ */}
      {(variant === 'full' || variant === 'standard') && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-1">
            <div className="text-center">
              <div className="text-sm font-bold text-warm-900">
                {player.stats?.avg_score?.toFixed(1) || '—'}
              </div>
              <div className="text-micro text-warm-500">Avg Score</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-warm-900">
                {player.stats?.fairways_hit_pct
                  ? `${(player.stats.fairways_hit_pct * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <div className="text-micro text-warm-500">FIR</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-warm-900">
                {player.stats?.avg_putts?.toFixed(1) || '—'}
              </div>
              <div className="text-micro text-warm-500">Putts</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-warm-900">
                {player.stats?.gir_pct
                  ? `${(player.stats.gir_pct * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <div className="text-micro text-warm-500">GIR</div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* RECENT ROUNDS MINI CHART */}
      {/* ============================================ */}
      {variant === 'full' &&
        player.recent_rounds &&
        player.recent_rounds.length > 0 && (
          <div className="px-4 pb-3">
            <div className="bg-warm-50 rounded-[10px] p-3">
              <MiniRoundsChart rounds={player.recent_rounds} height={40} />
              <div className="text-micro text-warm-400 mt-1 text-center">
                Last {player.recent_rounds.length} rounds
              </div>
            </div>
          </div>
        )}

      {/* ============================================ */}
      {/* ACTION BUTTONS */}
      {/* ============================================ */}
      {showActions && variant !== 'mini' && (
        <div
          className="
          flex items-center
          px-3 py-2
          border-t border-warm-100
          bg-warm-50/30
          rounded-b-[20px]
        "
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView?.();
            }}
            className="
              flex-1 flex items-center justify-center gap-1.5
              py-1.5
              text-xs font-medium text-warm-600
              hover:text-primary-600
              transition-colors duration-200
            "
          >
            <EyeIcon className="w-3.5 h-3.5" />
            View
          </button>

          <div className="w-px h-4 bg-warm-200" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onMessage?.();
            }}
            className="
              flex-1 flex items-center justify-center gap-1.5
              py-1.5
              text-xs font-medium text-warm-600
              hover:text-primary-600
              transition-colors duration-200
            "
          >
            <MessageSquareIcon className="w-3.5 h-3.5" />
            Message
          </button>

          <div className="w-px h-4 bg-warm-200" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onCompare?.();
            }}
            className="
              flex-1 flex items-center justify-center gap-1.5
              py-1.5
              text-xs font-medium text-warm-600
              hover:text-primary-600
              transition-colors duration-200
            "
          >
            <GitCompareIcon className="w-3.5 h-3.5" />
            Compare
          </button>

          <div className="w-px h-4 bg-warm-200" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionsOpen(true);
            }}
            className="
              w-8 flex items-center justify-center
              py-1.5
              text-warm-400 hover:text-warm-600
              transition-colors duration-200
            "
          >
            <MoreHorizontalIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Actions Menu */}
      <CardActionsMenu
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        actions={actions}
      />
    </div>
  );
}
