'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { markAnnouncementsSeen as markSeenAction } from '@/app/golf/actions/player-notifications';
import { getNotificationBadgeBundle } from '@/app/golf/actions/notification-badges';
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
/**
 * The first badge read waits for the browser to go idle (bounded by this
 * timeout) instead of firing during hydration. Next.js runs a client's server
 * actions one at a time, so a badge POST sent at mount sits in front of any
 * server action the page itself needs to render its content.
 */
export const INITIAL_FETCH_IDLE_TIMEOUT = 3_000;
/** Initial-read delay where `requestIdleCallback` is unavailable (WKWebView). */
export const INITIAL_FETCH_FALLBACK_DELAY = 1_500;
/**
 * WKWebView fires `visibilitychange` on every app foreground (and on the
 * share sheet, the keyboard accessory, etc.). Refetch on return only when the
 * last read is at least this old, so quick app switches do not stack POSTs.
 */
export const VISIBILITY_REFETCH_MIN_GAP = 15_000;

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
  /** Wall-clock of the last badge read — gates visibility-return refetches. */
  const lastFetchAtRef = useRef(0);
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

    lastFetchAtRef.current = Date.now();

    try {
      // ONE server action for every badge (see notification-badges.ts). The
      // three reads used to be three serial POSTs; they now run in parallel
      // server-side and come back together. A part is `null` when it was not
      // requested for this role or when that one read threw — handled exactly
      // as a thrown individual action was before.
      const bundle = await getNotificationBadgeBundle({
        role: isPlayer ? 'player' : 'coach',
        userId: userId ?? '',
        playerId: playerId ?? null,
        teamId: teamId ?? null,
        coachId: coachId ?? null,
      });

      if (isPlayer) {
        const result = bundle.player;
        if (result?.authExpired) {
          // Same circuit breaker the coach branch has had since the 45s poll
          // was added; the player branch kept polling a dead session.
          stopPolling();
          return;
        }
        if (result?.success && result.data) {
          setAnnouncements(result.data.unreadAnnouncements);
          setTasks(result.data.pendingTasks);
          // null means the count could not be read. HOLD the previous value
          // rather than dropping the badge to 0 — a confident "no unread
          // messages" during a transient fault is how a player misses a message
          // entirely. It self-corrects on the next 45s poll.
          const nextUnread = result.data.unreadMessages;
          setMessages((prev) => nextUnread ?? prev);
          setTravel(result.data.unseenTravel ?? 0);
          setCalendarNotifications(result.data.calendarNotifications ?? 0);
          setUnseenAnnouncements(result.data.unseenAnnouncements);
        }
      } else if (isCoach) {
        const result = bundle.coach;
        if (result?.authExpired) {
          stopPolling();
          return;
        }
        if (result?.success && result.data) {
          // null means the count could not be read. HOLD the previous value
          // rather than dropping the badge to 0 — a confident "no unread
          // messages" during a transient fault is how a coach misses a message
          // entirely. It self-corrects on the next 45s poll.
          const nextCoachUnread = result.data.unreadMessages;
          setMessages((prev) => nextCoachUnread ?? prev);
          setCalendarNotifications(result.data.calendarNotifications);
          setAnnouncements(0);
          setTasks(0);
          setTravel(0);
          setUnseenAnnouncements([]);
        }
        // CoachHelm unread-signal badge. Failure/empty leaves the count at 0
        // (honest: no badge), never a fabricated value.
        if (coachId) {
          const alerts = bundle.alerts;
          if (alerts?.authExpired) {
            stopPolling();
            return;
          }
          setCoachhelm(alerts?.success ? (alerts.counts?.critical ?? 0) : 0);
        }
      }

      // Unified notifications bell badge, half 2/2: unread rows in the
      // generic `notifications` table (CoachHelm dispatch.ts lifecycle
      // receipts + task-reminders.ts reminders), BOTH roles. NotificationBell
      // reads this + `calendarNotifications` above from this same context
      // instead of fetching its own count.
      const unread = bundle.unread;
      if (unread?.authExpired) {
        stopPolling();
      } else {
        setNotificationsUnread(unread?.success ? (unread.data?.unread ?? 0) : 0);
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

  // Initial fetch — deferred to idle so the page's own server actions reach
  // Next's one-at-a-time action queue first (see INITIAL_FETCH_IDLE_TIMEOUT).
  useEffect(() => {
    if (!isActive) return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(() => { void fetchCounts(); }, { timeout: INITIAL_FETCH_IDLE_TIMEOUT });
      return () => win.cancelIdleCallback?.(id);
    }
    // No idle API (iOS WKWebView / Safari): a short fixed delay does the same
    // job — the page's mount-time actions are queued first.
    const timer = setTimeout(() => { void fetchCounts(); }, INITIAL_FETCH_FALLBACK_DELAY);
    return () => clearTimeout(timer);
  }, [isActive, fetchCounts]);

  // Polling with visibility API
  useEffect(() => {
    if (!isActive) return;

    function handleVisibilityChange() {
      isVisibleRef.current = !document.hidden;
      // Refetch when the tab becomes visible — unless the last read is fresh
      // (see VISIBILITY_REFETCH_MIN_GAP).
      if (!document.hidden && Date.now() - lastFetchAtRef.current >= VISIBILITY_REFETCH_MIN_GAP) {
        void fetchCounts();
      }
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
