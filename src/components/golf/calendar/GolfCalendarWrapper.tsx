'use client';

import { useState, useCallback, useEffect } from 'react';
import { PremiumCalendarClient, type TeamMember } from './PremiumCalendarClient';
import { CalendarFeedManager, type FeedType } from './CalendarFeedManager';
import type { CalendarFeed } from './FeedCard';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useTeamContext } from '@/hooks/golf/use-team-context';

async function loadCalendarFeedActions() {
  return import('@/app/golf/actions/calendar-feeds');
}

interface GolfCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  teamTimezone?: string | null;
  /** Initial view for the inner grid — passed through to PremiumCalendarClient. */
  initialView?: 'day' | 'week' | 'month';
  /** Initial focus date for the inner grid — passed through. */
  initialDate?: Date;
}

/**
 * Client wrapper for the Golf Calendar that manages sync modal state.
 * This allows the server component page to pass data while the client
 * handles interactive modal states.
 */
export function GolfCalendarWrapper({
  initialEvents,
  teamMembers,
  isCoach = true,
  teamTimezone,
  initialView,
  initialDate,
}: GolfCalendarWrapperProps) {
  const [showFeedManager, setShowFeedManager] = useState(false);
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsError, setFeedsError] = useState<string | null>(null);
  const { teamId, userRole, coachId, playerId } = useTeamContext();

  // Current user's coach/player ID (for filtering themselves out of attendee lists)
  const currentUserId = coachId || playerId || undefined;
  const canManageTeamFeed = userRole === 'coach';
  const allowedTypes: FeedType[] = teamId && canManageTeamFeed ? ['team', 'personal'] : ['personal'];

  const loadFeeds = useCallback(async () => {
    setFeedsLoading(true);
    setFeedsError(null);

    try {
      const { getCalendarFeeds } = await loadCalendarFeedActions();
      const result = await getCalendarFeeds();
      if (result.success && result.data) {
        setFeeds(result.data);
      } else {
        setFeeds([]);
        setFeedsError(result.error || 'Failed to load calendar feeds');
      }
    } catch {
      setFeeds([]);
      setFeedsError('Unable to load calendar feeds. Please check your connection and try again.');
    }

    setFeedsLoading(false);
  }, []);

  useEffect(() => {
    if (showFeedManager) {
      void loadFeeds();
    }
  }, [showFeedManager, loadFeeds]);

  const handleCreateFeed = useCallback(async (type: FeedType, _name: string) => {
    void _name;
    if (type === 'team' && !canManageTeamFeed) {
      setFeedsError('Only coaches can manage team feeds');
      throw new Error('Only coaches can manage team feeds');
    }
    const { createCalendarFeed } = await loadCalendarFeedActions();
    const result = await createCalendarFeed(type as 'team' | 'personal');
    if (!result.success || !result.data) {
      setFeedsError(result.error || 'Failed to create feed');
      throw new Error(result.error || 'Failed to create feed');
    }
    setFeeds((prev) => {
      const existingIndex = prev.findIndex((feed) => feed.type === type);
      if (existingIndex === -1) {
        return [...prev, result.data!];
      }
      const next = [...prev];
      next[existingIndex] = result.data!;
      return next;
    });
    return result.data;
  }, [canManageTeamFeed]);

  const handleRegenerateFeed = useCallback(async (feedId: string) => {
    const target = feeds.find((feed) => feed.id === feedId);
    if (!target) return;
    if (target.type === 'team' && !canManageTeamFeed) {
      setFeedsError('Only coaches can manage team feeds');
      return;
    }

    const { regenerateCalendarFeed } = await loadCalendarFeedActions();
    const result = await regenerateCalendarFeed(target.type as 'team' | 'personal');
    if (!result.success || !result.data) {
      setFeedsError(result.error || 'Failed to regenerate feed');
      throw new Error(result.error || 'Failed to regenerate feed');
    }
    setFeeds((prev) => prev.map((feed) => (feed.id === feedId ? result.data! : feed)));
  }, [feeds, canManageTeamFeed]);

  const handleDeleteFeed = useCallback(async (feedId: string) => {
    const target = feeds.find((feed) => feed.id === feedId);
    if (!target) return;
    if (target.type === 'team' && !canManageTeamFeed) {
      setFeedsError('Only coaches can manage team feeds');
      return;
    }

    const { deleteCalendarFeed } = await loadCalendarFeedActions();
    const result = await deleteCalendarFeed(target.type as 'team' | 'personal');
    if (!result.success) {
      setFeedsError(result.error || 'Failed to disable feed');
      throw new Error(result.error || 'Failed to disable feed');
    }
    setFeeds((prev) => prev.filter((feed) => feed.id !== feedId));
  }, [feeds, canManageTeamFeed]);

  return (
    <>
      <PremiumCalendarClient
        initialEvents={initialEvents}
        teamMembers={teamMembers}
        isCoach={isCoach}
        currentUserId={currentUserId}
        onSyncSettings={() => setShowFeedManager(true)}
        teamTimezone={teamTimezone}
        teamId={teamId ?? undefined}
        initialView={initialView}
        initialDate={initialDate}
      />

      <Drawer
        open={showFeedManager}
        onOpenChange={(next) => {
          if (!next) setShowFeedManager(false);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Calendar Feeds</DrawerTitle>
          </DrawerHeader>
          <div
            className="px-6 pb-6 overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          >
            {feedsError && (
              <p className="text-sm text-rose-600 mb-4">{feedsError}</p>
            )}
            {feedsLoading ? (
              <div className="py-10 text-center text-sm text-warm-500">
                Loading calendar feeds...
              </div>
            ) : (
              <CalendarFeedManager
                feeds={feeds}
                onCreateFeed={handleCreateFeed}
                onRegenerateFeed={handleRegenerateFeed}
                onDeleteFeed={handleDeleteFeed}
                allowedTypes={allowedTypes}
                showNameInput={false}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
