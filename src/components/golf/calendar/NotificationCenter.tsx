'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { m, AnimatePresence, type PanInfo, useReducedMotion } from 'framer-motion';
import {
  IconBell,
  IconCheck,
  IconCalendar,
  IconMessageSquare,
  IconAlertCircle,
  IconX,
  IconClock,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useRouter } from 'next/navigation';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { clearPushBadge } from '@/lib/utils/push-registration';
import { Button } from '@/components/ui/button';

// ============================================================================
// HELPERS
// ============================================================================

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'event_invitation':
      return <IconCalendar size={16} className="text-blue-500" />;
    case 'rsvp_response':
      return <IconMessageSquare size={16} className="text-primary-500" />;
    case 'event_updated':
      return <IconAlertCircle size={16} className="text-amber-500" />;
    case 'event_cancelled':
      return <IconX size={16} className="text-red-500" />;
    case 'event_reminder':
    case 'event_reminder_24h':
    case 'event_reminder_1h':
    case 'event_reminder_manual':
    case 'rsvp_reminder':
      return <IconClock size={16} className="text-purple-500" />;
    default:
      return <IconBell size={16} className="text-warm-500" />;
  }
}

function formatTimeAgo(dateString: string, now: Date): string {
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function groupByDay(notifications: Notification[], now: Date | null) {
  const today: Notification[] = [];
  const earlier: Notification[] = [];
  if (!now) {
    // Pre-hydration: avoid time-based grouping; show all under "earlier" so SSR + first paint match.
    return { today, earlier: notifications };
  }
  for (const n of notifications) {
    if (isSameDay(new Date(n.created_at), now)) today.push(n);
    else earlier.push(n);
  }
  return { today, earlier };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function NotificationCenter() {
  const prefersReducedMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  // Initialize `now` on the client to avoid SSR/CSR mismatch when computing
  // "today" vs "earlier" grouping and relative timestamps.
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const {
    notifications,
    unreadCount,
    isLoading: loading,
    markAsRead,
    markAllAsRead,
  } = useNotifications({
    limit: 20,
    pollInterval: 30000,
  });

  const grouped = useMemo(() => groupByDay(notifications, now), [notifications, now]);

  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      void triggerHaptic('light');
      if (!notification.read) {
        await markAsRead(notification.id);
      }
      if (notification.action_url) {
        setIsOpen(false);
        router.push(notification.action_url);
      }
    },
    [markAsRead, router],
  );

  const handleMarkAllRead = useCallback(async () => {
    void triggerHaptic('light');
    await markAllAsRead();
    // Sync iOS app icon badge + clear delivered notifications
    await clearPushBadge();
  }, [markAllAsRead]);

  const handleToggle = useCallback(() => {
    void triggerHaptic('light');
    setIsOpen((v) => !v);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Bell Button — overflow-visible overrides the Button primitive's
          ripple-containing overflow-hidden, which was clipping the
          -top-1/-right-1 unread badge below. */}
      <Button variant="ghost"
        onClick={handleToggle}
        className="relative overflow-visible p-2.5 rounded-xl bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 shadow-sm text-warm-500 hover:text-warm-800 hover:bg-cream-50/92 hover:shadow-md active:scale-95 transition-all duration-200"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
      >
        <IconBell size={20} />

        {/* Unread indicator: dot when bell is closed & no count available,
            count badge when we know the number. iOS red (#FF3B30). */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-white text-eyebrow font-medium rounded-full flex items-center justify-center ring-2 ring-cream-50 tabular-nums"
            style={{ backgroundColor: '#FF3B30' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Notification Popover */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Popover */}
            <m.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.18, ease: [0.32, 0.72, 0, 1] })}
              className="fixed left-4 right-4 top-full mt-2 sm:absolute sm:left-auto sm:right-0 sm:w-[380px] surface-matte rounded-3xl shadow-[0_12px_40px_rgba(16,24,40,0.18)] z-50 overflow-clip"
            >
              {/* Header */}
              <div className="relative px-4 py-3 border-b border-warm-200/60 bg-gradient-to-br from-white/70 via-warm-50/40 to-primary-50/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-subhead font-medium text-warm-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary-50 ring-1 ring-primary-100 text-eyebrow font-medium text-primary-700 tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <Button variant="ghost"
                    onClick={handleMarkAllRead}
                    className="text-footnote text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    <IconCheck size={12} />
                    Clear all
                  </Button>
                )}
              </div>

              {/* Notification List */}
              <div
                className="max-h-[min(480px,60vh)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
                data-scroll-container
              >
                {loading ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-10 h-10 bg-warm-200 rounded-xl skeleton-shimmer" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="h-3.5 bg-warm-200 rounded-md w-3/4 skeleton-shimmer" />
                          <div className="h-3 bg-warm-100 rounded-md w-1/2 skeleton-shimmer" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <EmptyState />
                ) : (
                  <>
                    {grouped.today.length > 0 && (
                      <NotificationGroup
                        label="Today"
                        items={grouped.today}
                        now={now}
                        onSelect={handleNotificationClick}
                        onDismiss={markAsRead}
                      />
                    )}
                    {grouped.earlier.length > 0 && (
                      <NotificationGroup
                        label="Earlier"
                        items={grouped.earlier}
                        now={now}
                        onSelect={handleNotificationClick}
                        onDismiss={markAsRead}
                      />
                    )}
                  </>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-100/60 to-primary-200/50 flex items-center justify-center mb-4">
        <IconBell size={22} className="text-primary-600/70" />
      </div>
      <p className="text-subhead font-medium text-warm-900">All caught up</p>
      <p className="text-footnote text-warm-500 mt-1">You have no new notifications</p>
    </div>
  );
}

function NotificationGroup({
  label,
  items,
  now,
  onSelect,
  onDismiss,
}: {
  label: string;
  items: Notification[];
  now: Date | null;
  onSelect: (n: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <section>
      <div className="px-4 pt-3 pb-1.5 sticky top-0 bg-cream-50/92 backdrop-blur-xl z-10">
        <p className="text-caption-2 font-medium text-warm-500 uppercase tracking-[0.08em]">
          {label}
        </p>
      </div>
      <ul className="divide-y divide-warm-100">
        <AnimatePresence initial={false}>
          {items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              now={now}
              onSelect={onSelect}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function NotificationRow({
  notification,
  now,
  onSelect,
  onDismiss,
}: {
  notification: Notification;
  now: Date | null;
  onSelect: (n: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    // Swipe left >80px or fast flick → dismiss (mark as read).
    if (info.offset.x < -80 || info.velocity.x < -500) {
      void triggerHaptic('light');
      onDismiss(notification.id);
    }
  };

  return (
    <m.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, x: -120, height: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2, ease: [0.32, 0.72, 0, 1] })}
      className="relative"
    >
      {/* Swipe-reveal background (iOS red) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end pr-6 text-white text-xs font-medium"
        style={{ backgroundColor: '#FF3B30' }}
      >
        <IconX size={16} />
      </div>

      <m.button
        type="button"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        onDragEnd={handleDragEnd}
        onClick={() => onSelect(notification)}
        className={cn(
          'relative w-full px-4 py-3 flex gap-3 text-left',
          'bg-cream-50/92 hover:bg-warm-50 active:bg-warm-100 transition-colors',
          !notification.read && 'bg-primary-50/40',
        )}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-warm-50 flex items-center justify-center">
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-body-sm font-medium leading-snug',
              !notification.read ? 'text-warm-900' : 'text-warm-700',
            )}
          >
            {notification.title}
          </p>
          {notification.message && (
            <p className="text-footnote text-warm-500 mt-0.5 line-clamp-2 leading-snug">
              {notification.message}
            </p>
          )}
          <p className="text-caption-2 text-warm-500 mt-1 tabular-nums" suppressHydrationWarning>
            {now ? formatTimeAgo(notification.created_at, now) : ''}
          </p>
        </div>

        {/* Unread indicator — iOS blue dot */}
        {!notification.read && (
          <div className="flex-shrink-0 pt-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: '#007AFF' }}
            />
          </div>
        )}
      </m.button>
    </m.li>
  );
}
