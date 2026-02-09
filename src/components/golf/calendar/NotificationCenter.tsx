'use client';

import { useState } from 'react';
import { Bell, Check, Calendar, MessageSquare, AlertCircle, X, Clock } from 'lucide-react';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useRouter } from 'next/navigation';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'event_invitation':
      return <Calendar className="w-5 h-5 text-blue-500" />;
    case 'rsvp_response':
      return <MessageSquare className="w-5 h-5 text-green-500" />;
    case 'event_updated':
      return <AlertCircle className="w-5 h-5 text-amber-500" />;
    case 'event_cancelled':
      return <X className="w-5 h-5 text-red-500" />;
    case 'event_reminder':
    case 'rsvp_reminder':
      return <Clock className="w-5 h-5 text-purple-500" />;
    default:
      return <Bell className="w-5 h-5 text-warm-500" />;
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
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

// ============================================================================
// COMPONENT
// ============================================================================

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // Use the notifications hook with 30-second polling
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

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate if action URL exists
    if (notification.action_url) {
      setIsOpen(false);
      router.push(notification.action_url);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-warm-600 hover:text-warm-900 hover:bg-warm-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Popover */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-96 bg-white rounded-2xl border border-warm-200 shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-warm-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-warm-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[min(480px,60vh)] overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex gap-3">
                      <div className="w-10 h-10 bg-warm-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-warm-200 rounded w-3/4"></div>
                        <div className="h-3 bg-warm-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-warm-400" />
                  </div>
                  <p className="text-sm font-medium text-warm-900">All caught up!</p>
                  <p className="text-xs text-warm-500 mt-1">No new notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-warm-100">
                  {notifications.map(notification => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full px-4 py-3 flex gap-3 hover:bg-warm-50 transition-colors text-left ${
                        !notification.read ? 'bg-green-50/30' : ''
                      }`}
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          !notification.read ? 'text-warm-900' : 'text-warm-700'
                        }`}>
                          {notification.title}
                        </p>
                        {notification.message && (
                          <p className="text-xs text-warm-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-warm-400 mt-1">
                          {formatTimeAgo(notification.created_at)}
                        </p>
                      </div>

                      {/* Unread Indicator */}
                      {!notification.read && (
                        <div className="flex-shrink-0">
                          <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
