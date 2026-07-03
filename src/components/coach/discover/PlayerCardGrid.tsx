'use client';

import { useRef, useCallback, memo } from 'react';
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
  // Compare mode props
  showCheckbox?: boolean;
  selectedIds?: string[];
  onSelect?: (playerId: string) => void;
  // Featured players (top prospects)
  featuredIds?: string[];
  // Hover preview props
  onCardHover?: (player: PlayerCardData, event: React.MouseEvent) => void;
  onCardLeave?: () => void;
}

// Memoized card item to prevent unnecessary re-renders
const MemoizedCardItem = memo(function CardItem({
  player,
  variant,
  onWatchlist,
  onMessage,
  onPlayerClick,
  isOnWatchlist,
  showCheckbox,
  isSelected,
  onSelect,
  isFeatured,
  onMouseEnter,
  onMouseLeave,
}: {
  player: PlayerCardData;
  variant: 'default' | 'compact' | 'featured';
  onWatchlist?: (playerId: string) => void;
  onMessage?: (playerId: string) => void;
  onPlayerClick?: (playerId: string) => void;
  isOnWatchlist: boolean;
  showCheckbox: boolean;
  isSelected: boolean;
  onSelect?: (playerId: string) => void;
  isFeatured: boolean;
  onMouseEnter: (player: PlayerCardData, event: React.MouseEvent) => void;
  onMouseLeave: () => void;
}) {
  const handleWatchlist = useCallback(() => onWatchlist?.(player.id), [onWatchlist, player.id]);
  const handleMessage = useCallback(() => onMessage?.(player.id), [onMessage, player.id]);
  const handleClick = useCallback(() => onPlayerClick?.(player.id), [onPlayerClick, player.id]);
  const handleSelect = useCallback(() => onSelect?.(player.id), [onSelect, player.id]);
  const handleMouseEnter = useCallback((e: React.MouseEvent) => onMouseEnter(player, e), [onMouseEnter, player]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="transition-opacity duration-200"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <PlayerCard
        player={player}
        variant={variant}
        onWatchlist={onWatchlist ? handleWatchlist : undefined}
        onMessage={onMessage ? handleMessage : undefined}
        onPlayerClick={onPlayerClick ? handleClick : undefined}
        isOnWatchlist={isOnWatchlist}
        showCheckbox={showCheckbox}
        isSelected={isSelected}
        onSelect={onSelect ? handleSelect : undefined}
        isFeatured={isFeatured}
      />
    </div>
  );
});

function PlayerCardGridComponent({
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
  showCheckbox = false,
  selectedIds = [],
  onSelect,
  featuredIds = [],
  onCardHover,
  onCardLeave,
}: PlayerCardGridProps) {
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  // Hover handlers with 300ms delay
  const handleMouseEnter = useCallback((player: PlayerCardData, event: React.MouseEvent) => {
    if (!onCardHover) return;
    
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Set new timeout for 300ms delay
    hoverTimeoutRef.current = setTimeout(() => {
      onCardHover(player, event);
    }, 300);
  }, [onCardHover]);

  const handleMouseLeave = useCallback(() => {
    // Clear timeout if mouse leaves before delay completes
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    onCardLeave?.();
  }, [onCardLeave]);

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
        <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mb-4">
          <IconUsers size={28} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-semibold text-warm-900 mb-2">
          {emptyTitle}
        </h3>
        <p className="text-sm leading-relaxed text-warm-500 max-w-md">
          {emptyMessage}
        </p>
      </div>
    );
  }

  // Compact variant uses list layout
  if (variant === 'compact') {
    return (
      <div className={cn('space-y-2', className)}>
        {players.map((player) => (
          <MemoizedCardItem
            key={player.id}
            player={player}
            variant="compact"
            onWatchlist={onWatchlist}
            onMessage={onMessage}
            onPlayerClick={onPlayerClick}
            isOnWatchlist={watchlistIds.includes(player.id)}
            showCheckbox={showCheckbox}
            isSelected={selectedIds.includes(player.id)}
            onSelect={onSelect}
            isFeatured={featuredIds.includes(player.id)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </div>
    );
  }

  // Grid layout for default and featured variants
  return (
    <div className={cn('grid gap-6', gridCols[columns], className)}>
      {players.map((player) => (
        <MemoizedCardItem
          key={player.id}
          player={player}
          variant={variant}
          onWatchlist={onWatchlist}
          onMessage={onMessage}
          onPlayerClick={onPlayerClick}
          isOnWatchlist={watchlistIds.includes(player.id)}
          showCheckbox={showCheckbox}
          isSelected={selectedIds.includes(player.id)}
          onSelect={onSelect}
          isFeatured={featuredIds.includes(player.id)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ))}
    </div>
  );
}

// Skeleton loading card
function PlayerCardSkeleton({ variant = 'default' }: { variant?: string }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 border border-warm-100 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-warm-200" />
        <div className="flex-1">
          <div className="h-4 bg-warm-200 rounded w-32 mb-1.5" />
          <div className="h-3 bg-warm-200 rounded w-24" />
        </div>
      </div>
    );
  }

  if (variant === 'featured') {
    return (
      <div className="rounded-2xl bg-cream-50 border border-warm-100 overflow-hidden animate-pulse">
        <div className="h-32 bg-warm-200" />
        <div className="p-5 pt-0">
          <div className="-mt-10 mb-3">
            <div className="w-20 h-20 rounded-full bg-warm-200 ring-4 ring-white" />
          </div>
          <div className="h-5 bg-warm-200 rounded w-36 mb-2" />
          <div className="h-4 bg-warm-200 rounded w-28 mb-4" />
          <div className="flex gap-4 mb-4">
            <div className="h-3 bg-warm-200 rounded w-20" />
            <div className="h-3 bg-warm-200 rounded w-16" />
          </div>
          <div className="pt-4 border-t border-warm-100 flex gap-4">
            <div className="h-10 bg-warm-200 rounded w-16" />
            <div className="h-10 bg-warm-200 rounded w-16" />
            <div className="h-10 bg-warm-200 rounded w-16" />
          </div>
        </div>
      </div>
    );
  }

  // Default skeleton
  return (
    <div className="rounded-2xl bg-cream-50 border border-warm-100 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-warm-200" />
        <div className="flex-1">
          <div className="h-5 bg-warm-200 rounded w-36 mb-2" />
          <div className="h-4 bg-warm-200 rounded w-28 mb-2" />
          <div className="h-3 bg-warm-200 rounded w-40" />
        </div>
      </div>
      <div className="flex gap-3 mt-4 pt-4 border-t border-warm-100">
        <div className="h-4 bg-warm-200 rounded w-16" />
        <div className="h-4 bg-warm-200 rounded w-16" />
        <div className="h-4 bg-warm-200 rounded w-16" />
      </div>
    </div>
  );
}

// Export memoized grid and skeleton
export const PlayerCardGrid = memo(PlayerCardGridComponent);
