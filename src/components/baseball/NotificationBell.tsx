'use client';

// =============================================================================
// src/components/baseball/NotificationBell.tsx
//
// Phase F2 — Baseball notification bell for the coach/player shell header.
//
// Behaviour:
//   - Polls getUnreadNotificationCount() every 60 s via useEffect.
//   - Renders a bell icon with a CountBadge showing unread count.
//   - On click: opens a Popover fetching the latest 10 notifications via
//     getBaseballNotifications(10).
//   - "Mark all as read" button stamps read_at on every unread row and
//     clears the badge optimistically.
//
// Design tokens: cream/green palette — no blue/purple. Matches the shared
// BaseballFairwayShell header aesthetic (warm-matte surfaces, subtle
// ring focus, green-primary CTAs).
//
// Integration: mounted in BaseballFairwayShell's top bar actions slot.
// =============================================================================

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';
import { IconBell } from '@/components/icons';
import { CountBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  getBaseballNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type BaseballNotification,
} from '@/app/baseball/actions/notifications';

// ---------------------------------------------------------------------------
// Poll interval
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

interface NotificationRowProps {
  notification: BaseballNotification;
  onMarkRead: (id: string) => void;
}

function NotificationRow({ notification, onMarkRead }: NotificationRowProps) {
  const isUnread = notification.read_at === null;

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => {
        if (isUnread) onMarkRead(notification.id);
      }}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-xl transition-colors duration-150',
        'hover:bg-warm-50 active:bg-warm-100',
        isUnread && 'bg-primary-50/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
      )}
    >
      <div className="flex items-start gap-2.5">
        {isUnread && (
          <span
            aria-label="Unread"
            className="mt-1.5 flex-shrink-0 h-2 w-2 rounded-full bg-primary-500"
          />
        )}
        {!isUnread && <span className="mt-1.5 flex-shrink-0 h-2 w-2" />}

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm leading-snug truncate',
              isUnread ? 'font-semibold text-warm-900' : 'font-medium text-warm-700',
            )}
          >
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-warm-500 mt-0.5 line-clamp-2 leading-relaxed">
              {notification.body}
            </p>
          )}
          <p className="text-micro text-warm-400 mt-1">
            {formatTimeAgo(notification.created_at)}
          </p>
        </div>
      </div>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<BaseballNotification[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Gates the poll while the tab/app is backgrounded — ported from golf's
  // notification-badge-context.tsx (isVisibleRef + visibilitychange), which
  // already skips fetches while hidden instead of polling every 60s regardless.
  const isVisibleRef = useRef(true);

  // -------------------------------------------------------------------------
  // Poll unread count every 60 s (skipped while the tab is hidden)
  // -------------------------------------------------------------------------

  const refreshCount = useCallback(async () => {
    if (!isVisibleRef.current) return;
    try {
      const result = await getUnreadNotificationCount();
      if (result.success && result.count !== undefined) {
        setUnreadCount(result.count);
      }
    } catch {
      // Silent — badge simply doesn't update; no error shown for polling failure
    }
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      isVisibleRef.current = !document.hidden;
      if (!document.hidden) void refreshCount(); // Refetch when tab becomes visible
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void refreshCount();
    const interval = setInterval(() => void refreshCount(), POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [refreshCount]);

  // -------------------------------------------------------------------------
  // Fetch notification list when popover opens
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const result = await getBaseballNotifications(10);
      if (result.success && result.data) {
        setNotifications(result.data);
      }
    } catch {
      // Notifications list stays empty
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) void fetchNotifications();
    },
    [fetchNotifications],
  );

  // -------------------------------------------------------------------------
  // Mark one notification read (optimistic: update local state)
  // -------------------------------------------------------------------------

  const handleMarkRead = useCallback(
    (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      startTransition(async () => {
        try {
          await markNotificationRead(id);
        } catch {
          // Revert on failure by re-fetching
          void fetchNotifications();
          void refreshCount();
        }
      });
    },
    [fetchNotifications, refreshCount],
  );

  // -------------------------------------------------------------------------
  // Mark all read
  // -------------------------------------------------------------------------

  const handleMarkAllRead = useCallback(() => {
    // Optimistic update
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: now })));
    setUnreadCount(0);

    startTransition(async () => {
      try {
        await markAllNotificationsRead();
      } catch {
        // Revert by re-fetching
        void fetchNotifications();
        void refreshCount();
      }
    });
  }, [fetchNotifications, refreshCount]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const hasUnread = unreadCount > 0;
  const listUnreadCount = notifications.filter((n) => n.read_at === null).length;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          aria-label={
            hasUnread
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'Notifications'
          }
          className={cn(
            'relative flex items-center justify-center h-11 w-11 rounded-xl',
            'text-warm-600 transition-colors duration-150',
            'hover:bg-warm-100 hover:text-warm-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1',
            'active:scale-95 active:duration-75',
            className,
          )}
        >
          <IconBell size={20} />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 pointer-events-none">
              <CountBadge count={unreadCount} variant="danger" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-warm-100">
          <div className="flex items-center gap-2">
            <IconBell size={16} className="text-warm-500" />
            <h3 className="text-sm font-semibold text-warm-900">Notifications</h3>
            {listUnreadCount > 0 && (
              <span className="text-micro text-warm-400 font-medium">
                {listUnreadCount} unread
              </span>
            )}
          </div>

          {listUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className={cn(
                'text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 h-7 px-2',
                isPending && 'opacity-50',
              )}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[360px] overflow-y-auto overscroll-contain">
          {isLoadingList ? (
            <div className="p-3 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-2.5 p-2">
                  <Skeleton className="mt-1 h-2 w-2 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-2.5 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <IconBell size={28} className="text-warm-300" />
              <p className="text-sm font-medium text-warm-500">No notifications</p>
              <p className="text-xs text-warm-400">
                You&apos;re all caught up.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
