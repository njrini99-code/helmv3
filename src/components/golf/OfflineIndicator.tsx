'use client';

/**
 * Offline Indicator Component for Golf Shot Tracking
 *
 * Displays connection status, sync status, and pending item counts
 * with a premium glass design that integrates with the shot tracking UI.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface OfflineIndicatorProps {
  /** Whether the device is currently online */
  isOnline: boolean;
  /** Whether a sync is in progress */
  isSyncing: boolean;
  /** Number of pending items to sync */
  pendingCount: {
    shots: number;
    rounds: number;
    total: number;
  };
  /** Last successful sync time */
  lastSuccessfulSync: Date | null;
  /** Error message from last sync attempt */
  syncError: string | null;
  /** Callback to manually trigger sync */
  onSyncNow?: () => void;
  /** Callback to retry failed syncs */
  onRetrySync?: () => void;
  /** Callback to dismiss error */
  onDismissError?: () => void;
  /** Size variant */
  variant?: 'compact' | 'full';
  /** Position for mobile */
  position?: 'header' | 'floating';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatTimeSince(date: Date | null): string {
  if (!date) return 'Never';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 7200) return '1 hour ago';
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function OfflineIndicator({
  isOnline,
  isSyncing,
  pendingCount,
  lastSuccessfulSync,
  syncError,
  onSyncNow,
  onRetrySync,
  onDismissError,
  variant = 'compact',
  position = 'header',
}: OfflineIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('');

  // Update relative time text periodically
  useEffect(() => {
    const updateTime = () => {
      setLastSyncText(formatTimeSince(lastSuccessfulSync));
    };

    updateTime();
    const interval = setInterval(updateTime, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [lastSuccessfulSync]);

  // Auto-show details when offline or has errors
  useEffect(() => {
    if (!isOnline || syncError) {
      setShowDetails(true);
    }
  }, [isOnline, syncError]);

  // ============================================================================
  // RENDER - COMPACT VARIANT (for header)
  // ============================================================================

  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`
            flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
            transition-all duration-200
            ${!isOnline
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : isSyncing
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : syncError
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : pendingCount.total > 0
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
            }
          `}
        >
          {/* Status Icon */}
          {!isOnline ? (
            <WifiOffIcon className="w-3.5 h-3.5" />
          ) : isSyncing ? (
            <SyncingIcon className="w-3.5 h-3.5 animate-spin" />
          ) : syncError ? (
            <AlertIcon className="w-3.5 h-3.5" />
          ) : pendingCount.total > 0 ? (
            <CloudQueueIcon className="w-3.5 h-3.5" />
          ) : (
            <CloudDoneIcon className="w-3.5 h-3.5" />
          )}

          {/* Status Text */}
          <span className="hidden sm:inline">
            {!isOnline
              ? 'Offline'
              : isSyncing
                ? 'Syncing...'
                : syncError
                  ? 'Sync Error'
                  : pendingCount.total > 0
                    ? `${pendingCount.total} pending`
                    : 'Synced'
            }
          </span>

          {/* Pending count badge */}
          {pendingCount.total > 0 && !isSyncing && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-current/20 text-[10px] font-bold">
              {pendingCount.total}
            </span>
          )}
        </button>

        {/* Dropdown Details */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 mt-2 w-64 z-50"
            >
              <div className="bg-slate-800/95 backdrop-blur-xl rounded-lg border border-slate-700 shadow-xl p-3 space-y-3">
                {/* Connection Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Connection</span>
                  <span className={`text-xs font-medium ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Pending Items */}
                {pendingCount.total > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Pending</span>
                    <span className="text-xs font-medium text-slate-200">
                      {pendingCount.rounds > 0 && `${pendingCount.rounds} round${pendingCount.rounds !== 1 ? 's' : ''}`}
                      {pendingCount.rounds > 0 && pendingCount.shots > 0 && ', '}
                      {pendingCount.shots > 0 && `${pendingCount.shots} shot${pendingCount.shots !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                )}

                {/* Last Sync */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Last sync</span>
                  <span className="text-xs font-medium text-slate-200">{lastSyncText}</span>
                </div>

                {/* Error Message */}
                {syncError && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-md">
                    <p className="text-xs text-red-400">{syncError}</p>
                    {onRetrySync && (
                      <button
                        onClick={onRetrySync}
                        className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
                      >
                        Retry sync
                      </button>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-slate-700">
                  {isOnline && pendingCount.total > 0 && onSyncNow && !isSyncing && (
                    <button
                      onClick={onSyncNow}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded transition-colors"
                    >
                      Sync Now
                    </button>
                  )}
                  <button
                    onClick={() => setShowDetails(false)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ============================================================================
  // RENDER - FULL VARIANT (floating banner)
  // ============================================================================

  if (!isOnline || syncError || pendingCount.total > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`
          fixed ${position === 'floating' ? 'bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80' : 'top-0 left-0 right-0'}
          z-50
        `}
      >
        <div
          className={`
            ${position === 'floating' ? 'rounded-xl' : 'rounded-none'}
            ${!isOnline
              ? 'bg-amber-500/95'
              : syncError
                ? 'bg-red-500/95'
                : 'bg-emerald-500/95'
            }
            backdrop-blur-sm shadow-lg p-3
          `}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!isOnline ? (
                <WifiOffIcon className="w-5 h-5 text-white" />
              ) : syncError ? (
                <AlertIcon className="w-5 h-5 text-white" />
              ) : (
                <CloudQueueIcon className="w-5 h-5 text-white" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">
                  {!isOnline
                    ? 'You are offline'
                    : syncError
                      ? 'Sync error'
                      : `${pendingCount.total} items pending sync`
                  }
                </p>
                <p className="text-xs text-white/80">
                  {!isOnline
                    ? 'Your shots are saved locally and will sync when connected'
                    : syncError
                      ? syncError
                      : 'Will sync automatically when ready'
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOnline && pendingCount.total > 0 && onSyncNow && !isSyncing && (
                <button
                  onClick={onSyncNow}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                >
                  Sync
                </button>
              )}
              {isSyncing && (
                <SyncingIcon className="w-5 h-5 text-white animate-spin" />
              )}
              {(syncError || (!isOnline && pendingCount.total === 0)) && onDismissError && (
                <button
                  onClick={onDismissError}
                  className="p-1 text-white/60 hover:text-white transition-colors"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Don't render anything if online and synced
  return null;
}

// ============================================================================
// ICONS
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

function SyncingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function CloudQueueIcon({ className }: { className?: string }) {
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

function CloudDoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default OfflineIndicator;
