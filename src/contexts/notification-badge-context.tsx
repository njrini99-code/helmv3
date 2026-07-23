'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { getPlayerNotificationCounts, markAnnouncementsSeen as markSeenAction } from '@/app/golf/actions/player-notifications';
import { getCoachNotificationCounts } from '@/app/golf/actions/coach-notifications';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getNotificationsUnreadCount } from '@/app/golf/actions/unified-notifications';
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
  /**
   * Coach-only — unread urgent/high open CoachHelm signals (getAlertCounts).
   * Feeds the single "CoachHelm AI" sidebar entry badge. 0 → no badge (honest,
   * never a fake "0"); players always read 0.
   */
  coachhelm: number;
  /**
   * Unread rows in the generic `notifications` table — CoachHelm dispatch.ts
   * lifecycle receipts + task-reminders.ts reminders, both roles. This is
   * HALF of the unified notifications bell's badge; the other half is
   * `calendarNotifications` above (golf_calendar_notifications is already
   * counted there) — NotificationBell sums the two client-side rather than
   * this provider adding a second poll loop for the same feed.
   */
  notificationsUnread: number;
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
  coachhelm: 0,
  notificationsUnread: 0,
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
  const [coachhelm, setCoachhelm] = useState(0);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [unseenAnnouncements, setUnseenAnnouncements] = useState<GolfAnnouncementMeta[]>([]);
  const isVisibleRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Circuit breaker for a session that has gone away mid-tab (logout in
   * another tab, idle-timeout expiry — see project_helmv3_demo_mass_traffic_
   * hardening's 30-min demo idle). `isActive` below only reflects the role/
   * ids captured at mount from the server-resolved session; it can't see a
   * session that WAS live and has since expired. Once a poll reports
   * `authExpired`, stop hammering the same expected miss every 45s until a
   * fresh identity (re-login → new coachId/userId) proves the session is
   * live again.
   */
  const sessionExpiredRef = useRef(false);

  const isPlayer = role === 'player' && !!playerId && !!userId && !!teamId;
  const isCoach = role === 'coach' && !!coachId && !!userId;
  const isActive = isPlayer || isCoach;

  const stopPolling = useCallback(() => {
    sessionExpiredRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // A fresh identity (new userId/coachId — e.g. re-login after the breaker
  // tripped) means the session is live again; let polling resume.
  useEffect(() => {
    sessionExpiredRef.current = false;
  }, [userId, coachId, playerId]);

  const fetchCounts = useCallback(async () => {
    if (!isActive) return;
    if (sessionExpiredRef.current) return;
    if (!isVisibleRef.current) return;

    // Tracks whether THIS poll already learned the session is gone, so the
    // additive `notifications` unread fetch below can skip a second
    // round-trip to relearn the same thing (same spirit as the CoachHelm
    // badge's own skip-on-expired check).
    let sessionExpiredThisPoll = false;

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
        if (result.authExpired) {
          stopPolling();
          sessionExpiredThisPoll = true;
        } else if (result.success && result.data) {
          setMessages(result.data.unreadMessages);
          setCalendarNotifications(result.data.calendarNotifications);
          setAnnouncements(0);
          setTasks(0);
          setTravel(0);
          setUnseenAnnouncements([]);
        }
        // CoachHelm unread-signal badge — same poll, additive. Failure/empty
        // leaves the count at 0 (honest: no badge), never a fabricated value.
        // Skip when the session already proved expired above — no point
        // spending a second round-trip to learn the same thing twice.
        if (coachId && !result.authExpired) {
          try {
            const alerts = await getAlertCounts(coachId);
            setCoachhelm(alerts.success ? (alerts.counts?.critical ?? 0) : 0);
            if (alerts.authExpired) {
              stopPolling();
              sessionExpiredThisPoll = true;
            }
          } catch {
            setCoachhelm(0);
          }
        }
      }

      // Unified notifications bell badge, half 2/2: unread rows in the
      // generic `notifications` table (CoachHelm dispatch.ts lifecycle
      // receipts + task-reminders.ts reminders). Same 45s poll, additive,
      // BOTH roles (CoachHelm dispatches to players; task-reminders notifies
      // assigned players AND the assigning coach) — never a second poll loop
      // (NotificationBell reads this + `calendarNotifications` above from
      // this same context instead of fetching its own count).
      if (userId && !sessionExpiredThisPoll) {
        try {
          const unread = await getNotificationsUnreadCount();
          if (unread.authExpired) {
            stopPolling();
          } else {
            setNotificationsUnread(unread.success ? (unread.data?.unread ?? 0) : 0);
          }
        } catch {
          setNotificationsUnread(0);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error(err);
    }
  }, [isActive, isPlayer, isCoach, playerId, userId, teamId, coachId, stopPolling]);

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
      coachhelm,
      notificationsUnread,
      // `coachhelm` and `notificationsUnread` are intentionally excluded from
      // `total` — the rail badge map / NotificationBell read them directly;
      // the aggregate "total" stays the messaging/calendar unread sum it has
      // always been.
      total: announcements + tasks + messages + travel + calendarNotifications,
      unseenAnnouncements,
      hasUnseenAnnouncements: unseenAnnouncements.length > 0,
      markAnnouncementsSeen: handleMarkSeen,
      refetch: fetchCounts,
    };
  }, [isActive, announcements, tasks, messages, travel, calendarNotifications, coachhelm, notificationsUnread, unseenAnnouncements, handleMarkSeen, fetchCounts]);

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
