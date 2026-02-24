'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { getPlayerNotificationCounts, markAnnouncementsSeen as markSeenAction } from '@/app/golf/actions/player-notifications';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

// ============================================================================
// TYPES
// ============================================================================

interface NotificationBadges {
  announcements: number;
  tasks: number;
  messages: number;
  travel: number;
  total: number;
  unseenAnnouncements: GolfAnnouncementMeta[];
  hasUnseenAnnouncements: boolean;
  markAnnouncementsSeen: () => Promise<void>;
  refetch: () => Promise<void>;
}

const EMPTY_BADGES: NotificationBadges = {
  announcements: 0,
  tasks: 0,
  messages: 0,
  travel: 0,
  total: 0,
  unseenAnnouncements: [],
  hasUnseenAnnouncements: false,
  markAnnouncementsSeen: async () => {},
  refetch: async () => {},
};

const POLL_INTERVAL = 60_000; // 60 seconds

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationBadgeContext = createContext<NotificationBadges>(EMPTY_BADGES);

// ============================================================================
// PROVIDER
// ============================================================================

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const golfUser = useGolfUser();
  const { role, playerId, userId, teamId } = golfUser;

  const [announcements, setAnnouncements] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [messages, setMessages] = useState(0);
  const [travel, setTravel] = useState(0);
  const [unseenAnnouncements, setUnseenAnnouncements] = useState<GolfAnnouncementMeta[]>([]);
  const isVisibleRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Short-circuit for coaches
  const isPlayer = role === 'player' && !!playerId && !!userId && !!teamId;

  const fetchCounts = useCallback(async () => {
    if (!isPlayer || !playerId || !userId || !teamId) return;
    if (!isVisibleRef.current) return;

    try {
      const result = await getPlayerNotificationCounts(playerId, userId, teamId);
      if (result.success && result.data) {
        setAnnouncements(result.data.unreadAnnouncements);
        setTasks(result.data.pendingTasks);
        setMessages(result.data.unreadMessages);
        setTravel(result.data.unseenTravel ?? 0);
        setUnseenAnnouncements(result.data.unseenAnnouncements);
      }
    } catch {
      // Silently fail — badges are non-critical
    }
  }, [isPlayer, playerId, userId, teamId]);

  const handleMarkSeen = useCallback(async () => {
    setUnseenAnnouncements([]);
    try {
      await markSeenAction();
    } catch {
      // Silently fail
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isPlayer) fetchCounts();
  }, [isPlayer, fetchCounts]);

  // Polling with visibility API
  useEffect(() => {
    if (!isPlayer) return;

    function handleVisibilityChange() {
      isVisibleRef.current = !document.hidden;
      if (!document.hidden) fetchCounts(); // Refetch when tab becomes visible
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    intervalRef.current = setInterval(fetchCounts, POLL_INTERVAL);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlayer, fetchCounts]);

  const value = useMemo<NotificationBadges>(() => {
    if (!isPlayer) return EMPTY_BADGES;
    return {
      announcements,
      tasks,
      messages,
      travel,
      total: announcements + tasks + messages + travel,
      unseenAnnouncements,
      hasUnseenAnnouncements: unseenAnnouncements.length > 0,
      markAnnouncementsSeen: handleMarkSeen,
      refetch: fetchCounts,
    };
  }, [isPlayer, announcements, tasks, messages, travel, unseenAnnouncements, handleMarkSeen, fetchCounts]);

  return (
    <NotificationBadgeContext.Provider value={value}>
      {children}
    </NotificationBadgeContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Access notification badge counts for the current player.
 * Returns zeroes for coaches (no-op).
 * Available in all pages under the golf dashboard layout.
 */
export function useNotificationBadges(): NotificationBadges {
  return useContext(NotificationBadgeContext);
}
