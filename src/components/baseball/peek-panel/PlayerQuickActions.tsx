'use client';

import { memo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconMessage,
  IconUser,
  IconHeart,
  IconHeartFilled,
  IconChart,
  IconVideo,
} from '@/components/icons';
import { toggleWatchlistPlayer } from '@/app/baseball/actions/watchlist';

interface PlayerQuickActionsProps {
  playerId: string;
  isOnWatchlist: boolean;
  hasVideo: boolean;
  onWatchlistChange?: (isOnWatchlist: boolean) => void;
  onClose?: () => void;
  className?: string;
}

const PlayerQuickActionsComponent = function PlayerQuickActions({
  playerId,
  isOnWatchlist: initialIsOnWatchlist,
  hasVideo,
  onWatchlistChange,
  onClose,
  className,
}: PlayerQuickActionsProps) {
  const router = useRouter();
  const [isOnWatchlist, setIsOnWatchlist] = useState(initialIsOnWatchlist);
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false);

  const handleToggleWatchlist = useCallback(async () => {
    setIsTogglingWatchlist(true);
    try {
      const result = await toggleWatchlistPlayer(playerId);
      if (result.success) {
        const newState = result.action === 'added';
        setIsOnWatchlist(newState);
        onWatchlistChange?.(newState);
      }
    } catch (error) {
      console.error('Failed to toggle watchlist:', error);
    } finally {
      setIsTogglingWatchlist(false);
    }
  }, [playerId, onWatchlistChange]);

  const handleViewProfile = useCallback(() => {
    onClose?.();
    router.push(`/baseball/dashboard/players/${playerId}`);
  }, [playerId, router, onClose]);

  const handleMessage = useCallback(() => {
    onClose?.();
    router.push(`/baseball/dashboard/messages?player=${playerId}`);
  }, [playerId, router, onClose]);

  const handleViewStats = useCallback(() => {
    onClose?.();
    router.push(`/baseball/dashboard/players/${playerId}/stats`);
  }, [playerId, router, onClose]);

  const handleViewVideos = useCallback(() => {
    onClose?.();
    router.push(`/baseball/dashboard/players/${playerId}/videos`);
  }, [playerId, router, onClose]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleMessage}
          className="flex items-center justify-center gap-2"
        >
          <IconMessage size={16} />
          <span>Message</span>
        </Button>

        <Button
          variant={isOnWatchlist ? 'secondary' : 'outline'}
          size="sm"
          onClick={handleToggleWatchlist}
          disabled={isTogglingWatchlist}
          className={cn(
            'flex items-center justify-center gap-2',
            isOnWatchlist && 'bg-primary-50 border-primary-200 text-primary-700'
          )}
        >
          {isOnWatchlist ? (
            <>
              <IconHeartFilled size={16} className="text-primary-600" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <IconHeart size={16} />
              <span>Watchlist</span>
            </>
          )}
        </Button>
      </div>

      {/* Secondary actions */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewProfile}
          className="flex-1 flex items-center justify-center gap-2 text-warm-600 hover:text-warm-900"
        >
          <IconUser size={16} />
          <span>Full Profile</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewStats}
          className="flex-1 flex items-center justify-center gap-2 text-warm-600 hover:text-warm-900"
        >
          <IconChart size={16} />
          <span>Stats</span>
        </Button>

        {hasVideo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewVideos}
            className="flex-1 flex items-center justify-center gap-2 text-warm-600 hover:text-warm-900"
          >
            <IconVideo size={16} />
            <span>Videos</span>
          </Button>
        )}
      </div>
    </div>
  );
};

export const PlayerQuickActions = memo(PlayerQuickActionsComponent);
PlayerQuickActions.displayName = 'PlayerQuickActions';
