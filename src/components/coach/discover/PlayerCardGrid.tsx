'use client';

import { cn } from '@/lib/utils';
import { PlayerCard, PlayerCardData } from './PlayerCard';
import { IconUsers } from '@/components/icons';

interface PlayerCardGridProps {
  players: PlayerCardData[];
  variant?: 'default' | 'compact' | 'featured';
  columns?: 2 | 3 | 4;
  onWatchlist?: (playerId: string) => void;
  onMessage?: (playerId: string) => void;
  onPlayerClick?: (playerId: string) => void;
  watchlistIds?: string[];
  loading?: boolean;
  emptyMessage?: string;
  emptyTitle?: string;
  className?: string;
}

export function PlayerCardGrid({
  players,
  variant = 'default',
  columns = 3,
  onWatchlist,
  onMessage,
  onPlayerClick,
  watchlistIds = [],
  loading = false,
  emptyTitle = 'No players found',
  emptyMessage = 'Try adjusting your filters or search criteria',
  className,
}: PlayerCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn('grid gap-6', gridCols[columns], className)}>
        {Array.from({ length: columns * 2 }).map((_, i) => (
          <PlayerCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    );
  }

  // Empty state
  if (!players.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <IconUsers size={28} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          {emptyTitle}
        </h3>
        <p className="text-sm leading-relaxed text-slate-500 max-w-md">
          {emptyMessage}
        </p>
      </div>
    );
  }

  // Compact variant uses list layout with stagger
  if (variant === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        {players.map((player, index) => (
          <div
            key={player.id}
            className="animate-fade-up"
            style={{
              animationDelay: `${Math.min(index * 30, 300)}ms`,
              animationFillMode: 'both'
            }}
          >
            <PlayerCard
              player={player}
              variant="compact"
              onWatchlist={onWatchlist ? () => onWatchlist(player.id) : undefined}
              onMessage={onMessage ? () => onMessage(player.id) : undefined}
              onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
              isOnWatchlist={watchlistIds.includes(player.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  // Grid layout for default and featured variants with stagger animation
  return (
    <div className={cn('grid gap-6', gridCols[columns], className)}>
      {players.map((player, index) => (
        <div
          key={player.id}
          className="animate-fade-up"
          style={{
            animationDelay: `${Math.min(index * 50, 500)}ms`,
            animationFillMode: 'both'
          }}
        >
          <PlayerCard
            player={player}
            variant={variant}
            onWatchlist={onWatchlist ? () => onWatchlist(player.id) : undefined}
            onMessage={onMessage ? () => onMessage(player.id) : undefined}
            onPlayerClick={onPlayerClick ? () => onPlayerClick(player.id) : undefined}
            isOnWatchlist={watchlistIds.includes(player.id)}
          />
        </div>
      ))}
    </div>
  );
}

// Skeleton loading card
function PlayerCardSkeleton({ variant = 'default' }: { variant?: string }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-slate-200" />
        <div className="flex-1">
          <div className="h-4 bg-slate-200 rounded w-32 mb-1.5" />
          <div className="h-3 bg-slate-200 rounded w-24" />
        </div>
      </div>
    );
  }

  if (variant === 'featured') {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden animate-pulse">
        <div className="h-32 bg-slate-200" />
        <div className="p-5 pt-0">
          <div className="-mt-10 mb-3">
            <div className="w-20 h-20 rounded-full bg-slate-200 ring-4 ring-white" />
          </div>
          <div className="h-5 bg-slate-200 rounded w-36 mb-2" />
          <div className="h-4 bg-slate-200 rounded w-28 mb-4" />
          <div className="flex gap-4 mb-4">
            <div className="h-3 bg-slate-200 rounded w-20" />
            <div className="h-3 bg-slate-200 rounded w-16" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex gap-4">
            <div className="h-10 bg-slate-200 rounded w-16" />
            <div className="h-10 bg-slate-200 rounded w-16" />
            <div className="h-10 bg-slate-200 rounded w-16" />
          </div>
        </div>
      </div>
    );
  }

  // Default skeleton
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-200" />
        <div className="flex-1">
          <div className="h-5 bg-slate-200 rounded w-36 mb-2" />
          <div className="h-4 bg-slate-200 rounded w-28 mb-2" />
          <div className="h-3 bg-slate-200 rounded w-40" />
        </div>
      </div>
      <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
        <div className="h-4 bg-slate-200 rounded w-16" />
        <div className="h-4 bg-slate-200 rounded w-16" />
        <div className="h-4 bg-slate-200 rounded w-16" />
      </div>
    </div>
  );
}

// Export skeleton for standalone use
export { PlayerCardSkeleton };
