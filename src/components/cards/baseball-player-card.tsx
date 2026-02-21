'use client';

import { useState } from 'react';
import {
  EyeIcon,
  MessageSquareIcon,
  GitCompareIcon,
  MoreHorizontalIcon,
  StarIcon,
  CheckCircleIcon,
  MapPinIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardActionsMenu, type CardAction } from './card-actions-menu';
import type { BaseballPlayer, CardVariant } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface BaseballPlayerCardProps {
  player: BaseballPlayer;
  variant?: CardVariant;
  selected?: boolean;
  onSelect?: () => void;
  onView?: () => void;
  onMessage?: () => void;
  onCompare?: () => void;
  onAddToWatchlist?: () => void;
  showActions?: boolean;
  className?: string;
}

// ============================================
// CONFIG
// ============================================

// Position-specific stat configurations
const positionStats: Record<string, { key: string; label: string }[]> = {
  pitcher: [
    { key: 'fastball_velo', label: 'Fastball' },
    { key: 'era', label: 'ERA' },
    { key: 'whip', label: 'WHIP' },
    { key: 'k_per_9', label: 'K/9' },
  ],
  catcher: [
    { key: 'batting_avg', label: 'AVG' },
    { key: 'pop_time', label: 'Pop Time' },
    { key: 'fielding_pct', label: 'FLD%' },
    { key: 'rbi', label: 'RBI' },
  ],
  infielder: [
    { key: 'batting_avg', label: 'AVG' },
    { key: 'home_runs', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'fielding_pct', label: 'FLD%' },
  ],
  outfielder: [
    { key: 'batting_avg', label: 'AVG' },
    { key: 'home_runs', label: 'HR' },
    { key: 'stolen_bases', label: 'SB' },
    { key: 'sixty_time', label: '60 yd' },
  ],
};

// Commitment status styles
const commitmentStyles = {
  committed: {
    bg: 'bg-primary-50',
    text: 'text-primary-700',
    icon: CheckCircleIcon,
  },
  interested: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: StarIcon,
  },
  uncommitted: { bg: 'bg-warm-100', text: 'text-warm-600', icon: null },
};

// ============================================
// HELPERS
// ============================================

// Get position category for stats
function getPositionCategory(position: string): string {
  const pos = position?.toUpperCase() || '';
  if (['RHP', 'LHP', 'P'].includes(pos)) return 'pitcher';
  if (['C'].includes(pos)) return 'catcher';
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos)) return 'infielder';
  return 'outfielder';
}

// Format stat value
function formatStat(key: string, value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if ((key === 'batting_avg' || key === 'fielding_pct' || key === 'whip') && typeof value === 'number') {
    return value.toFixed(3).replace(/^0/, '');
  }
  if (key === 'era' && typeof value === 'number') return value.toFixed(2);
  if (key === 'fastball_velo') return `${value}`;
  if (key === 'pop_time' || key === 'sixty_time') return `${value}s`;
  return String(value);
}

// ============================================
// COMPONENT
// ============================================

export function BaseballPlayerCard({
  player,
  variant = 'standard',
  selected = false,
  onSelect,
  onView,
  onMessage,
  onCompare,
  onAddToWatchlist,
  showActions = true,
  className,
}: BaseballPlayerCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);

  const positionCategory = getPositionCategory(player.primary_position || '');
  const statsConfig = positionStats[positionCategory];

  // Get commitment status
  const commitment = player.commitment_status || 'uncommitted';
  const commitStyle = commitmentStyles[commitment] || commitmentStyles.uncommitted;
  const CommitIcon = commitStyle.icon;

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
    {
      label: 'Add to Watchlist',
      icon: StarIcon,
      onClick: () => onAddToWatchlist?.(),
    },
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
            {player.primary_position} • Class of {player.grad_year}
          </p>

          {variant !== 'mini' && (
            <p className="text-xs text-warm-400 mt-0.5 truncate flex items-center gap-1">
              <MapPinIcon className="w-3 h-3" />
              {player.high_school_name}, {player.state}
            </p>
          )}

          {/* Commitment Badge */}
          {variant !== 'mini' &&
            player.commitment_status &&
            player.commitment_status !== 'uncommitted' && (
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 mt-2',
                  'px-2 py-1 rounded-md text-xs font-medium',
                  commitStyle.bg,
                  commitStyle.text
                )}
              >
                {CommitIcon && <CommitIcon className="w-3 h-3" />}
                {player.committed_school || 'Committed'}
              </div>
            )}
        </div>
      </div>

      {/* ============================================ */}
      {/* STATS BAR */}
      {/* ============================================ */}
      {variant !== 'mini' && (
        <div className="px-4 pb-3">
          <div
            className="
            grid grid-cols-4 gap-1
            bg-gradient-to-r from-warm-50 to-warm-100/50
            rounded-[12px] p-3
          "
          >
            {(statsConfig || []).map((stat) => (
              <div key={stat.key} className="text-center">
                <div className="text-sm font-bold text-warm-900">
                  {formatStat(stat.key, player.stats?.[stat.key as keyof typeof player.stats])}
                </div>
                <div className="text-micro text-warm-500 uppercase tracking-wide">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* PHYSICAL INFO */}
      {/* ============================================ */}
      {(variant === 'full' || variant === 'standard') && (
        <div className="px-4 pb-3">
          <div className="text-xs text-warm-500 flex items-center gap-2">
            <span>
              {player.height_feet && player.height_inches
                ? `${player.height_feet}'${player.height_inches}"`
                : '—'}
            </span>
            <span>•</span>
            <span>{player.weight_lbs ? `${player.weight_lbs} lbs` : '—'}</span>
            <span>•</span>
            <span>
              {player.bats}/{player.throws}
            </span>
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
