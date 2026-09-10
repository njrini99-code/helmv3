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

/**
 * Shared empty-array constant (2026-09-10 perf audit) — every "no unseen
 * announcements" write reuses THIS reference instead of allocating a fresh
 * `[]`. `unseenAnnouncements` flows into the memoized context `value` below,
 * so a new array reference on every 45s poll — even one whose CONTENT never
 * changed — produced a new `value` object and re-rendered all 8 consumers
 * of `useNotificationBadges()` for nothing.
 */
const EMPTY_UNSEEN_ANNOUNCEMENTS: GolfAnnouncementMeta[] = [];

const EMPTY_BADGES: NotificationBadges = {
  announcements: 0,
  tasks: 0,
  messages: 0,
  travel: 0,
  calendarNotifications: 0,
  coachhelm: 0,
  notificationsUnread: 0,
  total: 0,
  unseenAnnouncements: EMPTY_UNSEEN_ANNOUNCEMENTS,
  hasUnseenAnnouncements: false,
  markAnnouncementsSeen: async () => {},
  refetch: async () => {},
};

const POLL_INTERVAL = 45_000; // 45 seconds

/**
 * Structural compare over the fields the badge/login-modal UI actually
 * reads: `updated_at` catches a title/body edit, the count/ack fields catch
 * an acknowledgement or task completion landing on an announcement that was
 * already unseen. Used to bail a `setUnseenAnnouncements` update out to the
 * SAME array reference when a poll's payload is content-identical to what's
 * already in state, same spirit as `useCalendarRangeEvents`' recency merge.
 */
function sameUnseenAnnouncements(
  a: readonly GolfAnnouncementMeta[],
  b: readonly GolfAnnouncementMeta[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.updated_at !== y.updated_at ||
      x.acknowledged_count !== y.acknowledged_count ||
      x.has_player_acknowledged !== y.has_player_acknowledged ||
      x.task_count !== y.task_count ||
      x.completed_task_count !== y.completed_task_count
    ) {
      return false;
    }
  }
  return true;
}

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
  const [unseenAnnouncements, setUnseenAnnouncements] = useState<GolfAnnouncementMeta[]>(
    EMPTY_UNSEEN_ANNOUNCEMENTS,
  );
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

    try {
      if (isPlayer && playerId && userId && teamId) {
        // Both calls dispatched together (2026-09-10 perf audit) — this poll
        // used to await the main counts call, THEN the unified-notifications
        // call, back to back, doubling the round-trip latency of every 45s
        // poll for no reason (neither call's result decides whether the
        // other should run). One trade-off from going concurrent: the coach
        // branch below can no longer skip the unified call just because the
        // main call already learned the session is gone — both always fire,
        // and each independently calls `stopPolling()` if IT sees
        // `authExpired`, which is idempotent.
        const [countsResult, unifiedResult] = await Promise.allSettled([
          getPlayerNotificationCounts(playerId, userId, teamId),
          getNotificationsUnreadCount(),
        ]);

        if (countsResult.status === 'fulfilled') {
          const result = countsResult.value;
          if (result.authExpired) {
            // Same circuit breaker the coach branch has had since the 45s
            // poll was added; the player branch kept polling a dead session.
            stopPolling();
          } else if (result.success && result.data) {
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
            const nextUnseen = result.data.unseenAnnouncements;
            setUnseenAnnouncements((prev) =>
              sameUnseenAnnouncements(prev, nextUnseen) ? prev : nextUnseen,
            );
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.error(countsResult.reason);
        }

        if (unifiedResult.status === 'fulfilled') {
          const unread = unifiedResult.value;
          if (unread.authExpired) {
            stopPolling();
          } else {
            setNotificationsUnread(unread.success ? (unread.data?.unread ?? 0) : 0);
          }
        } else {
          setNotificationsUnread(0);
        }
      } else if (isCoach && userId) {
        // All three calls dispatched together, same reasoning as the player
        // branch above. `getAlertCounts` still only fires when there's a
        // `coachId` to ask about — that gating doesn't depend on either
        // sibling call's result, only on an id already in hand.
        const [coachResult, alertsResult, unifiedResult] = await Promise.allSettled([
          getCoachNotificationCounts(userId, teamId),
          coachId ? getAlertCounts(coachId) : Promise.resolve(null),
          getNotificationsUnreadCount(),
        ]);

        if (coachResult.status === 'fulfilled') {
          const result = coachResult.value;
          if (result.authExpired) {
            stopPolling();
          } else if (result.success && result.data) {
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
            setUnseenAnnouncements((prev) =>
              prev.length === 0 ? prev : EMPTY_UNSEEN_ANNOUNCEMENTS,
            );
          }
        } else if (process.env.NODE_ENV === 'development') {
          console.error(coachResult.reason);
        }

        // CoachHelm unread-signal badge — additive. Failure/empty leaves the
        // count at 0 (honest: no badge), never a fabricated value. `null`
        // here means there was no `coachId` to ask about at all (the ternary
        // above), matching the original "skip entirely without one" behavior.
        if (alertsResult.status === 'fulfilled') {
          if (alertsResult.value) {
            const alerts = alertsResult.value;
            setCoachhelm(alerts.success ? (alerts.counts?.critical ?? 0) : 0);
            if (alerts.authExpired) stopPolling();
          }
        } else {
          setCoachhelm(0);
        }

        // Unified notifications bell badge, half 2/2: unread rows in the
        // generic `notifications` table (CoachHelm dispatch.ts lifecycle
        // receipts + task-reminders.ts reminders). BOTH roles (CoachHelm
        // dispatches to players; task-reminders notifies assigned players
        // AND the assigning coach) — never a second poll loop (NotificationBell
        // reads this + `calendarNotifications` above from this same context
        // instead of fetching its own count).
        if (unifiedResult.status === 'fulfilled') {
          const unread = unifiedResult.value;
          if (unread.authExpired) {
            stopPolling();
          } else {
            setNotificationsUnread(unread.success ? (unread.data?.unread ?? 0) : 0);
          }
        } else {
          setNotificationsUnread(0);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error(err);
    }
  }, [isActive, isPlayer, isCoach, playerId, userId, teamId, coachId, stopPolling]);

  const handleMarkSeen = useCallback(async () => {
    setUnseenAnnouncements((prev) => (prev.length === 0 ? prev : EMPTY_UNSEEN_ANNOUNCEMENTS));
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
