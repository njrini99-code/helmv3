'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconMessage, IconStar, IconStarFilled } from '@/components/icons';
import { toast } from '@/components/ui/sonner';
import { toggleWatchlistPlayer } from '@/app/baseball/actions/watchlist';
import { createConversation } from '@/app/baseball/actions/messages';

interface PlayerProfileCoachActionsProps {
  playerId: string;
  playerUserId: string | null;
  initialIsInWatchlist: boolean;
}

export function PlayerProfileCoachActions({
  playerId,
  playerUserId,
  initialIsInWatchlist,
}: PlayerProfileCoachActionsProps) {
  const router = useRouter();
  const [isMessaging, startMessageTransition] = useTransition();
  const [isTogglingWatchlist, startWatchlistTransition] = useTransition();
  const [isInWatchlist, setIsInWatchlist] = useState(initialIsInWatchlist);

  const handleMessage = () => {
    if (!playerUserId) {
      toast.error('Cannot message this player');
      return;
    }

    startMessageTransition(async () => {
      try {
        const result = await createConversation([playerUserId]);
        router.push(`/baseball/dashboard/messages/${result.conversationId}`);
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast.error('Failed to start conversation');
      }
    });
  };

  const handleToggleWatchlist = () => {
    startWatchlistTransition(async () => {
      const result = await toggleWatchlistPlayer(playerId);

      if (result.success) {
        setIsInWatchlist(result.action === 'added');
        toast.success(
          result.action === 'added' ? 'Added to watchlist' : 'Removed from watchlist',
        );
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update watchlist');
      }
    });
  };

  return (
    <>
      <Button className="w-full" onClick={handleMessage} disabled={isMessaging}>
        <IconMessage size={16} />
        {isMessaging ? 'Opening...' : 'Send Message'}
      </Button>
      <Button
        variant="secondary"
        className="w-full"
        onClick={handleToggleWatchlist}
        disabled={isTogglingWatchlist}
      >
        {isInWatchlist ? (
          <IconStarFilled size={16} className="text-primary-600" />
        ) : (
          <IconStar size={16} />
        )}
        {isTogglingWatchlist
          ? 'Updating...'
          : isInWatchlist
            ? 'Remove from Watchlist'
            : 'Add to Watchlist'}
      </Button>
    </>
  );
}
