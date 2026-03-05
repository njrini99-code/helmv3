'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/app/golf/actions/golf';

// ============================================================================
// TYPES
// ============================================================================

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  action_url: string | null;
  created_at: string;
}

interface UseNotificationsOptions {
  limit?: number;
  pollInterval?: number; // in milliseconds (default: 30000 = 30s)
  enabled?: boolean;
}

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to manage notifications with automatic polling
 *
 * @example
 * ```tsx
 * const {
 *   notifications,
 *   unreadCount,
 *   isLoading,
 *   markAsRead,
 *   markAllAsRead
 * } = useNotifications({ limit: 20, pollInterval: 30000 });
 * ```
 */
export function useNotifications({
  limit = 50,
  pollInterval = 30000, // 30 seconds
  enabled = true,
}: UseNotificationsOptions = {}): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getNotifications(limit);

      if (result.success) {
        // Map CalendarNotification to local Notification type (read_at null = unread)
        const mappedNotifications: Notification[] = result.data.map((n) => ({
          id: n.id,
          type: n.notification_type,
          title: n.title ?? '',
          message: n.message,
          read: n.read_at !== null,
          action_url: n.action_url,
          created_at: n.created_at ?? new Date().toISOString(),
        }));
        setNotifications(mappedNotifications);
        setUnreadCount(mappedNotifications.filter((n) => !n.read).length);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [limit, enabled]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const result = await markNotificationRead(notificationId);

      if (result.success) {
        // Optimistically update UI
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, read: true } : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } else {
        console.error('Failed to mark notification as read:', result.error);
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const result = await markAllNotificationsRead();

      if (result.success) {
        // Optimistically update UI
        setNotifications(prev =>
          prev.map(n => ({ ...n, read: true }))
        );
        setUnreadCount(0);
      } else {
        console.error('Failed to mark all notifications as read:', result.error);
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Polling — paused when tab is hidden to avoid wasted requests
  useEffect(() => {
    if (!enabled || pollInterval <= 0) return;

    const pollIfVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };

    const interval = setInterval(pollIfVisible, pollInterval);

    // Also refetch when tab becomes visible again after being hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchNotifications, pollInterval, enabled]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
