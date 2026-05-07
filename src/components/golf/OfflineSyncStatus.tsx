'use client';

/**
 * Offline Sync Status Component
 *
 * A floating status component that displays:
 * - Current sync status (online/offline/syncing)
 * - Pending items count
 * - Sync progress
 * - Retry button for failed syncs
 *
 * Position:
 * - Mobile: Fixed bottom-right corner
 * - Desktop: Can be placed in sidebar or header
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';

// ============================================================================
// TYPES
// ============================================================================

interface OfflineSyncStatusProps {
  /** Position variant */
  position?: 'floating' | 'inline' | 'sidebar';
  /** Size variant */
  size?: 'compact' | 'full';
  /** Whether to show expanded details by default */
  defaultExpanded?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether to auto-hide when synced */
  autoHide?: boolean;
  /** Auto-hide delay in ms */
  autoHideDelay?: number;
  /** Whether to show when online with no pending items */
  showWhenOnline?: boolean;
  /** Callback when sync now is clicked */
  onSyncNow?: () => void;
  /** Callback when retry failed is clicked */
  onRetryFailed?: () => void;
  /** Callback when error is dismissed */
  onDismissError?: () => void;
}

// ============================================================================
// ICON COMPONENTS
// ============================================================================

function WifiOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
      />
    </svg>
  );
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
      />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTimeSince(dateString: string | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OfflineSyncStatus({
  position = 'floating',
  size = 'compact',
  defaultExpanded = false,
  className,
  autoHide = true,
  autoHideDelay = 5000,
  showWhenOnline = false,
  onSyncNow,
  onRetryFailed,
  onDismissError,
}: OfflineSyncStatusProps) {
  // Store state
  const {
    isOnline,
    isSyncing,
    syncStatus,
    pendingCount,
    lastSuccessfulSync,
    syncError,
    syncProgress,
    showOfflineBanner,
  } = useOfflineSyncStore();

  // Store actions
  const {
    startSync,
    retrySync,
    clearSyncError,
    hideBanner,
  } = useOfflineSyncStore();

  // Connection status for quality indicator
  const connectionStatus = useConnectionStatus({
    autoCheck: true,
    checkInterval: 60000,
  });

  // Local state
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isVisible, setIsVisible] = useState(true);
  const [lastSyncText, setLastSyncText] = useState('');

  // Update relative time text periodically
  useEffect(() => {
    const updateTime = () => {
      // Convert Date to ISO string for formatTimeSince, or pass null
      // Defensive: lastSuccessfulSync may be a string after store rehydration from localStorage
      const syncTimeString = lastSuccessfulSync
        ? (lastSuccessfulSync instanceof Date ? lastSuccessfulSync.toISOString() : String(lastSuccessfulSync))
        : null;
      setLastSyncText(formatTimeSince(syncTimeString));
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [lastSuccessfulSync]);

  // Auto-expand when offline or has errors
  useEffect(() => {
    if (!isOnline || syncError) {
      setIsExpanded(true);
      setIsVisible(true);
    }
  }, [isOnline, syncError]);

  // Auto-hide when synced
  useEffect(() => {
    if (autoHide && isOnline && pendingCount.total === 0 && !syncError && syncStatus === 'success') {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
      return undefined;
    }
  }, [autoHide, autoHideDelay, isOnline, pendingCount.total, syncError, syncStatus]);

  // Handle sync now
  const handleSyncNow = useCallback(() => {
    if (!isSyncing) {
      if (onSyncNow) {
        onSyncNow();
      } else {
        startSync();
      }
    }
  }, [isSyncing, startSync, onSyncNow]);

  // Handle retry
  const handleRetry = useCallback(() => {
    clearSyncError();
    if (onRetryFailed) {
      onRetryFailed();
    } else {
      retrySync();
    }
  }, [clearSyncError, retrySync, onRetryFailed]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    if (onDismissError) {
      onDismissError();
    } else {
      clearSyncError();
    }
    hideBanner();
    if (isOnline && pendingCount.total === 0) {
      setIsVisible(false);
    }
  }, [clearSyncError, hideBanner, isOnline, pendingCount.total, onDismissError]);

  // Don't render if nothing to show
  // Always render when there are pending items or sync errors — even when online
  const hasPendingOrError = pendingCount.total > 0 || !!syncError;
  if (!hasPendingOrError && !showWhenOnline && !isVisible && !showOfflineBanner && isOnline) {
    return null;
  }

  // Determine status icon and color
  const getStatusDisplay = () => {
    if (!isOnline) {
      return {
        icon: <WifiOffIcon className="w-4 h-4" />,
        label: 'Offline',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50 border-amber-200',
      };
    }
    if (isSyncing) {
      return {
        icon: <SyncIcon className="w-4 h-4 animate-spin" />,
        label: 'Syncing...',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50 border-blue-200',
      };
    }
    if (syncError) {
      return {
        icon: <AlertCircleIcon className="w-4 h-4" />,
        label: 'Sync Error',
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200',
      };
    }
    if (pendingCount.total > 0) {
      return {
        icon: <CloudUploadIcon className="w-4 h-4" />,
        label: `${pendingCount.total} pending`,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50 border-blue-200',
      };
    }
    return {
      icon: <CheckCircleIcon className="w-4 h-4" />,
      label: 'Synced',
      color: 'text-primary-600',
      bgColor: 'bg-primary-50 border-primary-200',
    };
  };

  const statusDisplay = getStatusDisplay();

  // Position classes
  const positionClasses = {
    floating: 'fixed bottom-24 right-4 z-50 md:bottom-6',
    inline: '',
    sidebar: 'mb-4',
  };

  // ============================================================================
  // COMPACT VARIANT
  // ============================================================================

  if (size === 'compact') {
    return (
      <div className={cn(positionClasses[position], className)}>
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
        >
          <Popover open={isExpanded} onOpenChange={setIsExpanded}>
            <PopoverTrigger asChild>
              <button
                aria-label={`Sync status: ${statusDisplay.label}. ${isExpanded ? 'Collapse' : 'Expand'} details`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg backdrop-blur-sm transition-all',
                  statusDisplay.bgColor,
                  'hover:shadow-xl'
                )}
              >
                <span className={statusDisplay.color}>{statusDisplay.icon}</span>
                <span className={cn('text-sm font-medium', statusDisplay.color)}>
                  {statusDisplay.label}
                </span>
                <ChevronDownIcon
                  className={cn(
                    'w-4 h-4 transition-transform',
                    statusDisplay.color,
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-72 bg-white border border-warm-200 p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-warm-900">Sync Status</span>
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss sync status"
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-warm-500 hover:text-warm-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Connection status */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">Connection</span>
                <span className={cn('font-medium', isOnline ? 'text-primary-600' : 'text-amber-600')}>
                  {isOnline ? (
                    <span className="flex items-center gap-1">
                      <WifiIcon className="w-4 h-4" />
                      {connectionStatus.isSlowConnection ? 'Slow' : 'Online'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <WifiOffIcon className="w-4 h-4" />
                      Offline
                    </span>
                  )}
                </span>
              </div>

              {/* Pending items */}
              {pendingCount.total > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-warm-500">Pending</span>
                  <span className="text-warm-900 font-medium">
                    {pendingCount.rounds > 0 && `${pendingCount.rounds} round${pendingCount.rounds !== 1 ? 's' : ''}`}
                    {pendingCount.rounds > 0 && pendingCount.shots > 0 && ', '}
                    {pendingCount.shots > 0 && `${pendingCount.shots} shot${pendingCount.shots !== 1 ? 's' : ''}`}
                    {pendingCount.total === 0 && 'None'}
                  </span>
                </div>
              )}

              {/* Last sync */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-500">Last sync</span>
                <span className="text-warm-700">{lastSyncText}</span>
              </div>

              {/* Sync progress */}
              {isSyncing && syncProgress && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-warm-500 capitalize">{syncProgress.phase}</span>
                    <span className="text-warm-700">
                      {syncProgress.current}/{syncProgress.total}
                    </span>
                  </div>
                  <div
                    className="w-full h-1.5 bg-warm-100 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={syncProgress.percentComplete}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Sync progress: ${syncProgress.percentComplete}%`}
                  >
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${syncProgress.percentComplete}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error message */}
              {syncError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">{syncError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-warm-100">
                {isOnline && pendingCount.total > 0 && !isSyncing && (
                  <button
                    onClick={handleSyncNow}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                  >
                    Sync Now
                  </button>
                )}
                {syncError && (
                  <button
                    onClick={handleRetry}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                )}
                {!syncError && pendingCount.total === 0 && isOnline && (
                  <button
                    onClick={handleDismiss}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-warm-600 hover:text-warm-900 transition-colors"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </motion.div>
      </div>
    );
  }

  // ============================================================================
  // FULL VARIANT (Banner)
  // ============================================================================

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        positionClasses[position],
        'w-full max-w-md',
        className
      )}
    >
      <div
        className={cn(
          'rounded-xl border shadow-lg backdrop-blur-sm p-4',
          !isOnline
            ? 'bg-amber-50/95 border-amber-200'
            : syncError
              ? 'bg-red-50/95 border-red-200'
              : 'bg-cream-50/95 border-warm-200'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              !isOnline
                ? 'bg-amber-100'
                : syncError
                  ? 'bg-red-100'
                  : isSyncing
                    ? 'bg-blue-100'
                    : 'bg-primary-100'
            )}
          >
            <span
              className={cn(
                !isOnline
                  ? 'text-amber-600'
                  : syncError
                    ? 'text-red-600'
                    : isSyncing
                      ? 'text-blue-600'
                      : 'text-primary-600'
              )}
            >
              {statusDisplay.icon}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                'text-sm font-medium',
                !isOnline
                  ? 'text-amber-900'
                  : syncError
                    ? 'text-red-900'
                    : 'text-warm-900'
              )}
            >
              {!isOnline
                ? 'You are offline'
                : syncError
                  ? 'Sync error'
                  : isSyncing
                    ? 'Syncing your data...'
                    : pendingCount.total > 0
                      ? `${pendingCount.total} items pending sync`
                      : 'All data synced'}
            </p>
            <p
              className={cn(
                'text-xs mt-0.5',
                !isOnline
                  ? 'text-amber-700'
                  : syncError
                    ? 'text-red-700'
                    : 'text-warm-500'
              )}
            >
              {!isOnline
                ? 'Your shots are saved locally and will sync when connected'
                : syncError
                  ? syncError
                  : isSyncing && syncProgress
                    ? `${syncProgress.phase}: ${syncProgress.current}/${syncProgress.total}`
                    : pendingCount.total > 0
                      ? 'Will sync automatically when ready'
                      : `Last sync: ${lastSyncText}`}
            </p>

            {/* Progress bar */}
            {isSyncing && syncProgress && (
              <div
                className="mt-2 w-full h-1.5 bg-warm-200 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={syncProgress.percentComplete}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Sync progress: ${syncProgress.percentComplete}%`}
              >
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${syncProgress.percentComplete}%` }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {isOnline && pendingCount.total > 0 && !isSyncing && (
              <button
                onClick={handleSyncNow}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
              >
                Sync
              </button>
            )}
            {syncError && (
              <button
                onClick={handleRetry}
                className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 text-xs font-medium text-red-600 bg-red-100 hover:bg-red-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
              >
                Retry
              </button>
            )}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss sync status"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-warm-500 hover:text-warm-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

