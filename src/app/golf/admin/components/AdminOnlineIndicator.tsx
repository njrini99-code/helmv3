'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import { type AdminPresenceInfo, getAdminInitials, getAdminColor } from '@/hooks/useAdminPresence';

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
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter out current user for "others online"
  const otherAdmins = activeAdmins.filter((a) => a.id !== currentUserId);
  const displayCount = currentUserId ? otherAdmins.length : onlineCount;

  return (
    <div className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200',
          'bg-white/50 hover:bg-white/70 border border-white/20',
          isExpanded && 'bg-white/70'
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
                  'w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white',
                  getAdminColor(admin.id)
                )}
                title={admin.name || admin.email || 'Unknown'}
              >
                {getAdminInitials(admin)}
              </div>
            ))}
            {otherAdmins.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-warm-100 flex items-center justify-center text-warm-600 text-[10px] font-semibold ring-2 ring-white">
                +{otherAdmins.length - 3}
              </div>
            )}
          </div>
        )}
      </button>

      {/* Expanded dropdown */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsExpanded(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'absolute top-full right-0 mt-2 z-50',
                'w-80 bg-white/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-xl overflow-hidden'
              )}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-warm-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-warm-500" />
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
                <span className="text-[10px] text-warm-400 uppercase tracking-wider">
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
            <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
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
