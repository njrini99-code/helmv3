'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { getPlayerNotificationCounts, markAnnouncementsSeen as markSeenAction } from '@/app/golf/actions/player-notifications';
import { getCoachNotificationCounts } from '@/app/golf/actions/coach-notifications';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { isNativeApp } from '@/lib/utils/capacitor';

// ============================================================================
// TYPES
// ============================================================================

interface NotificationBadges {
  announcements: number;
  tasks: number;
  messages: number;
  travel: number;
  calendarNotifications: number;
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
  calendarNotifications: 0,
  total: 0,
  unseenAnnouncements: [],
  hasUnseenAnnouncements: false,
  markAnnouncementsSeen: async () => {},
  refetch: async () => {},
};

const POLL_INTERVAL = 45_000; // 45 seconds

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationBadgeContext = createContext<NotificationBadges>(EMPTY_BADGES);

// ============================================================================
// PROVIDER
// ============================================================================

export function NotificationBadgeProvider({ children }: { children: React.ReactNode }) {
  const golfUser = useGolfUser();
  const { role, playerId, userId, teamId, coachId } = golfUser;

  const [announcements, setAnnouncements] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [messages, setMessages] = useState(0);
  const [travel, setTravel] = useState(0);
  const [calendarNotifications, setCalendarNotifications] = useState(0);
  const [unseenAnnouncements, setUnseenAnnouncements] = useState<GolfAnnouncementMeta[]>([]);
  const isVisibleRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPlayer = role === 'player' && !!playerId && !!userId && !!teamId;
  const isCoach = role === 'coach' && !!coachId && !!userId;
  const isActive = isPlayer || isCoach;

  const fetchCounts = useCallback(async () => {
    if (!isActive) return;
    if (!isVisibleRef.current) return;

    try {
      if (isPlayer && playerId && userId && teamId) {
        const result = await getPlayerNotificationCounts(playerId, userId, teamId);
        if (result.success && result.data) {
          setAnnouncements(result.data.unreadAnnouncements);
          setTasks(result.data.pendingTasks);
          setMessages(result.data.unreadMessages);
          setTravel(result.data.unseenTravel ?? 0);
          setCalendarNotifications(result.data.calendarNotifications ?? 0);
          setUnseenAnnouncements(result.data.unseenAnnouncements);
        }
      } else if (isCoach && userId) {
        const result = await getCoachNotificationCounts(userId, teamId);
        if (result.success && result.data) {
          setMessages(result.data.unreadMessages);
          setCalendarNotifications(result.data.calendarNotifications);
          setAnnouncements(0);
          setTasks(0);
          setTravel(0);
          setUnseenAnnouncements([]);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error(err);
    }
  }, [isActive, isPlayer, isCoach, playerId, userId, teamId]);

  const handleMarkSeen = useCallback(async () => {
    setUnseenAnnouncements([]);
    try {
      await markSeenAction();
    } catch {
      // Silently fail
    }
    // Clear delivered notifications on iOS (Capacitor only — web throws "not implemented")
    if (isNativeApp()) {
      try {
        import('@capacitor/push-notifications').then(({ PushNotifications }) => {
          PushNotifications.removeAllDeliveredNotifications().catch(() => {});
        }).catch(() => {});
      } catch { /* Capacitor plugin not available on web */ }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isActive) fetchCounts();
  }, [isActive, fetchCounts]);

  // Polling with visibility API
  useEffect(() => {
    if (!isActive) return;

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
  }, [isActive, fetchCounts]);

  const value = useMemo<NotificationBadges>(() => {
    if (!isActive) return EMPTY_BADGES;
    return {
      announcements,
      tasks,
      messages,
      travel,
      calendarNotifications,
      total: announcements + tasks + messages + travel + calendarNotifications,
      unseenAnnouncements,
      hasUnseenAnnouncements: unseenAnnouncements.length > 0,
      markAnnouncementsSeen: handleMarkSeen,
      refetch: fetchCounts,
    };
  }, [isActive, announcements, tasks, messages, travel, calendarNotifications, unseenAnnouncements, handleMarkSeen, fetchCounts]);

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
 * Access notification badge counts for the current user (player or coach).
 * Available in all pages under the golf dashboard layout.
 */
export function useNotificationBadges(): NotificationBadges {
  return useContext(NotificationBadgeContext);
}
