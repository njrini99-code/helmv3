'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { IconUsers } from '@/components/icons';
import { type AdminPresenceInfo, getAdminInitials, getAdminColor } from '@/hooks/useAdminPresence';
import { Button } from '@/components/ui/button';

// ============================================
// TYPES
// ============================================

interface AdminOnlineIndicatorProps {
  activeAdmins: AdminPresenceInfo[];
  onlineCount: number;
  isConnected: boolean;
  currentUserId?: string;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function AdminOnlineIndicator({
  activeAdmins,
  onlineCount,
  isConnected,
  currentUserId,
  className,
}: AdminOnlineIndicatorProps) {
  // Filter out current user for "others online"
  const otherAdmins = activeAdmins.filter((a) => a.id !== currentUserId);
  const displayCount = currentUserId ? otherAdmins.length : onlineCount;

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost"
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200',
              'glass-subtle hover:bg-cream-100',
              'data-[state=open]:bg-cream-100'
            )}
          >
            {/* Status indicator */}
            <div className="relative">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-primary-500' : 'bg-warm-300'
                )}
              />
              {isConnected && (
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary-500 animate-ping opacity-75" />
              )}
            </div>

            {/* Count */}
            <span className="text-warm-600 tabular-nums">
              {displayCount > 0 ? (
                <>
                  <span className="font-semibold text-warm-800">{displayCount}</span>
                  {' admin'}
                  {displayCount !== 1 ? 's' : ''} online
                </>
              ) : (
                <span className="text-warm-500">Only you online</span>
              )}
            </span>

            {/* Avatar stack */}
            {otherAdmins.length > 0 && (
              <div className="flex -space-x-2">
                {otherAdmins.slice(0, 3).map((admin) => (
                  <div
                    key={admin.id}
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-white text-micro font-semibold ring-2 ring-white',
                      getAdminColor(admin.id)
                    )}
                    title={admin.name || admin.email || 'Unknown'}
                  >
                    {getAdminInitials(admin)}
                  </div>
                ))}
                {otherAdmins.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-warm-100 flex items-center justify-center text-warm-600 text-micro font-semibold ring-2 ring-white">
                    +{otherAdmins.length - 3}
                  </div>
                )}
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-80 p-0 overflow-clip">
          {/* Header */}
          <div className="px-4 py-3 border-b border-warm-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconUsers size={16} className="text-warm-500" />
              <span className="font-semibold text-warm-900">Active Admins</span>
            </div>
            <span className="text-xs text-warm-500 tabular-nums">
              {onlineCount} total
            </span>
          </div>

          {/* Admin list */}
          <div className="max-h-64 overflow-y-auto">
            {activeAdmins.length === 0 ? (
              <div className="px-4 py-6 text-center text-warm-500 text-sm">
                No admins online
              </div>
            ) : (
              <div className="py-2">
                {activeAdmins.map((admin) => (
                  <AdminListItem
                    key={admin.id}
                    admin={admin}
                    isCurrentUser={admin.id === currentUserId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Connection status */}
          <div className="px-4 py-2 border-t border-warm-100 flex items-center justify-between">
            <span className="text-micro text-warm-400 uppercase tracking-wider">
              Connection
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                isConnected ? 'text-primary-600' : 'text-amber-600'
              )}
            >
              {isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================
// LIST ITEM
// ============================================

interface AdminListItemProps {
  admin: AdminPresenceInfo;
  isCurrentUser: boolean;
}

function AdminListItem({ admin, isCurrentUser }: AdminListItemProps) {
  // Format last active time
  const lastActive = admin.last_active
    ? getRelativeTime(new Date(admin.last_active))
    : 'Unknown';

  // Get tab display name
  const tabName = getTabDisplayName(admin.currentTab);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 hover:bg-warm-50 active:bg-warm-100 transition-colors',
        isCurrentUser && 'bg-primary-50/50'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0',
          getAdminColor(admin.id)
        )}
      >
        {admin.avatar_url ? (
          <Image
            src={admin.avatar_url}
            alt={admin.name || 'Admin'}
            width={36}
            height={36}
            className="w-full h-full rounded-full object-cover"
            unoptimized
          />
        ) : (
          getAdminInitials(admin)
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-warm-900 truncate">
            {admin.name || admin.email?.split('@')[0] || 'Unknown'}
          </span>
          {isCurrentUser && (
            <span className="text-micro bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-warm-500">
          <span className="truncate">{tabName}</span>
          <span className="text-warm-300">·</span>
          <span className="tabular-nums">{lastActive}</span>
        </div>
      </div>

      {/* Active indicator */}
      <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 30) return 'Active now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getTabDisplayName(tab: string): string {
  const tabNames: Record<string, string> = {
    command: 'Command Center',
    users: 'Users & Activity',
    health: 'Health & Issues',
    analytics: 'Analytics & Growth',
    sports: 'Sport Operations',
    audit: 'Audit & Security',
  };

  return tabNames[tab] || tab;
}
