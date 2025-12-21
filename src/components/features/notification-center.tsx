'use client';

import { useState, useRef, useEffect } from 'react';
import { IconBell, IconX, IconCheck } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'profile_view' | 'watchlist_add' | 'message' | 'evaluation' | 'camp_interest' | 'other';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actorName?: string;
  actorAvatar?: string;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  className?: string;
}

const typeIcons: Record<string, { icon: string; color: string }> = {
  profile_view: { icon: '👁️', color: 'bg-blue-100 text-blue-600' },
  watchlist_add: { icon: '⭐', color: 'bg-amber-100 text-amber-600' },
  message: { icon: '💬', color: 'bg-green-100 text-green-600' },
  evaluation: { icon: '📊', color: 'bg-purple-100 text-purple-600' },
  camp_interest: { icon: '🏕️', color: 'bg-cyan-100 text-cyan-600' },
  other: { icon: '🔔', color: 'bg-gray-100 text-gray-600' },
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  className
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={cn('relative', className)}>
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <IconBell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse" />
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl border border-border shadow-elevation-4 overflow-hidden animate-fade-in z-50"
        >
          {/* Header */}
          <div className="p-4 border-b border-border-light">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="primary" className="px-2 py-0.5">
                    {unreadCount}
                  </Badge>
                )}
              </h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAllAsRead}
                  className="text-xs"
                >
                  <IconCheck size={14} />
                  Mark all read
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 bg-cream-50 p-1 rounded-lg">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  filter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  filter === 'unread'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                Unread {unreadCount > 0 && `(${unreadCount})`}
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <IconBell size={24} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {filter === 'unread' ? 'All caught up!' : 'No notifications'}
                </p>
                <p className="text-xs text-gray-500">
                  {filter === 'unread'
                    ? 'You have no unread notifications'
                    : 'Notifications will appear here'}
                </p>
              </div>
            ) : (
              <div>
                {filteredNotifications.map((notification) => {
                  const typeConfig = typeIcons[notification.type] || typeIcons['other'];
                  const config = typeConfig!; // Assert non-null since we have fallback

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'relative group hover:bg-cream-50 transition-colors border-b border-border-light last:border-0',
                        !notification.read && 'bg-blue-50/30'
                      )}
                    >
                      <div className="p-4">
                        <div className="flex gap-3">
                          {/* Icon or Avatar */}
                          {notification.actorAvatar ? (
                            <Avatar
                              name={notification.actorName || ''}
                              src={notification.actorAvatar}
                              size="md"
                            />
                          ) : (
                            <div className={cn(
                              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg',
                              config.color
                            )}>
                              {config.icon}
                            </div>
                          )}

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 mb-0.5">
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimestamp(notification.timestamp)}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read && (
                              <button
                                onClick={() => onMarkAsRead(notification.id)}
                                className="p-1 hover:bg-white rounded transition-colors"
                                title="Mark as read"
                              >
                                <IconCheck size={14} className="text-gray-400 hover:text-gray-600" />
                              </button>
                            )}
                            <button
                              onClick={() => onDelete(notification.id)}
                              className="p-1 hover:bg-white rounded transition-colors"
                              title="Delete"
                            >
                              <IconX size={14} className="text-gray-400 hover:text-red-600" />
                            </button>
                          </div>
                        </div>

                        {/* Unread indicator */}
                        {!notification.read && (
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-600 rounded-full" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {filteredNotifications.length > 0 && (
            <div className="p-3 border-t border-border-light bg-cream-50">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-brand-600 hover:text-brand-700"
              >
                View all notifications
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
