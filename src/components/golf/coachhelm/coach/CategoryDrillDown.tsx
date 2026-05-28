'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown, IconMinus, IconChevronRight, IconWarning } from '@/components/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

interface Player {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  value: number;
  trend: 'improving' | 'stable' | 'declining';
  trendDelta: number;
  needsAttention: boolean;
}

interface CategoryDrillDownProps {
  players: Player[];
  primaryMetric: string;
  formatValue?: (v: number) => string;
  lowerIsBetter?: boolean;
  onPlayerClick?: (playerId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const trendStyles = {
  improving: { icon: IconTrendingUp, color: 'text-primary-600' },
  stable: { icon: IconMinus, color: 'text-warm-400' },
  declining: { icon: IconTrendingDown, color: 'text-red-500' },
} as const;

export function CategoryDrillDown({
  players,
  primaryMetric,
  formatValue,
  lowerIsBetter = false,
  onPlayerClick,
}: CategoryDrillDownProps) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) =>
      lowerIsBetter ? a.value - b.value : b.value - a.value
    );
  }, [players, lowerIsBetter]);

  const handleClick = (playerId: string) => {
    if (onPlayerClick) {
      onPlayerClick(playerId);
    } else {
      router.push(`/golf/dashboard/players/${playerId}`);
    }
  };

  const defaultFormat = (v: number) => v.toFixed(1);
  const fmt = formatValue ?? defaultFormat;

  if (sortedPlayers.length === 0) {
    return (
      <div className="surface-matte rounded-3xl p-6">
        <p className="text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-400 mb-3">
          Player Breakdown
        </p>
        <EmptyState
          variant="minimal"
          type="generic"
          description="No player data available for this category yet."
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, ease: 'easeOut', delay: 0.1 })}
      className="surface-matte rounded-3xl overflow-hidden"
    >
      {/* Section title */}
      <div className="px-6 pt-5 pb-3">
        <p className="text-eyebrow font-medium uppercase tracking-[0.12em] opacity-80 text-warm-400">
          Player Breakdown
        </p>
      </div>

      {/* Player rows */}
      <ul className="divide-y divide-warm-100/60">
        {sortedPlayers.map((player, index) => {
          const trendStyle = trendStyles[player.trend];
          const TrendIcon = trendStyle.icon;
          const deltaPrefix = player.trendDelta > 0 ? '+' : '';

          return (
            <li key={player.playerId}>
              <Button variant="ghost"
                type="button"
                onClick={() => handleClick(player.playerId)}
                className={cn(
                  'flex w-full items-center gap-3 px-6 py-3.5',
                  'hover:bg-cream-100/82 transition-colors duration-150',
                  'text-left group cursor-pointer'
                )}
              >
                {/* Rank */}
                <span className="w-6 text-sm font-medium tabular-nums text-warm-400 shrink-0">
                  {index + 1}.
                </span>

                {/* Avatar */}
                <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden bg-warm-100 flex items-center justify-center">
                  {player.avatarUrl ? (
                    <img
                      src={player.avatarUrl}
                      alt={player.playerName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-medium text-warm-500">
                      {getInitials(player.playerName)}
                    </span>
                  )}
                </div>

                {/* Name */}
                <span className="font-medium text-warm-900 truncate min-w-0 flex-1">
                  {player.playerName}
                </span>

                {/* Value */}
                <span className="font-medium tabular-nums text-warm-900 shrink-0">
                  {fmt(player.value)}{' '}
                  <span className="text-xs font-normal text-warm-400">{primaryMetric}</span>
                </span>

                {/* Trend */}
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-sm tabular-nums shrink-0 w-16 justify-end',
                    trendStyle.color
                  )}
                >
                  <TrendIcon size={13} />
                  <span>{deltaPrefix}{player.trendDelta}</span>
                </span>

                {/* Attention badge */}
                <span className="w-5 shrink-0 flex justify-center">
                  {player.needsAttention && (
                    <IconWarning size={16} className="text-amber-500" />
                  )}
                </span>

                {/* View arrow */}
                <span className="text-warm-300 group-hover:text-primary-500 transition-colors shrink-0">
                  <IconChevronRight size={16} />
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
