'use client';

/**
 * Offline Warning Banner Component
 *
 * Displays warnings when the user is offline or has poor connectivity.
 * Used in round entry flow to inform users about offline mode.
 *
 * Features:
 * - Connection status display
 * - Offline mode explanation
 * - Sync status when coming back online
 * - Dismissable banner
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';

// ============================================================================
// TYPES
// ============================================================================

interface OfflineWarningBannerProps {
  /** Type of banner */
  variant?: 'inline' | 'floating' | 'modal';
  /** Whether to show for slow connections too */
  showForSlowConnection?: boolean;
  /** Whether the banner can be dismissed */
  dismissable?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Custom class name */
  className?: string;
  /** Context message (e.g., "Starting a round") */
  context?: string;
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

function WifiSlowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v3m0 0l-2-2m2 2l2-2"
      />
    </svg>
  );
}

function CloudSaveIcon({ className }: { className?: string }) {
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
        d="M12 12v6m0 0l-2-2m2 2l2-2"
      />
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OfflineWarningBanner({
  variant = 'inline',
  showForSlowConnection = true,
  dismissable = true,
  onDismiss,
  className,
  context,
}: OfflineWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const connectionStatus = useConnectionStatus();
  const { pendingCount } = useOfflineSyncStore();

  // Reset dismissed state when status changes significantly
  useEffect(() => {
    if (!connectionStatus.isOnline && isDismissed) {
      setIsDismissed(false);
    }
  }, [connectionStatus.isOnline, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Determine if we should show the banner
  const shouldShow =
    !isDismissed &&
    (!connectionStatus.isOnline || (showForSlowConnection && connectionStatus.isSlowConnection));

  if (!shouldShow) {
    return null;
  }

  // Determine banner content based on status
  const isOffline = !connectionStatus.isOnline;
  const isSlow = connectionStatus.isSlowConnection;

  const title = isOffline
    ? "You're offline"
    : isSlow
      ? 'Slow connection detected'
      : '';

  const description = isOffline
    ? `Your shots will be saved locally and synced when you're back online.${context ? ` ${context}` : ''}`
    : isSlow
      ? 'Your shots will be saved locally first for faster entry.'
      : '';

  const icon = isOffline ? (
    <WifiOffIcon className="w-5 h-5" />
  ) : (
    <WifiSlowIcon className="w-5 h-5" />
  );

  const bgColor = isOffline ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200';
  const textColor = isOffline ? 'text-amber-800' : 'text-blue-800';
  const iconColor = isOffline ? 'text-amber-500' : 'text-blue-500';

  // ============================================================================
  // INLINE VARIANT
  // ============================================================================

  if (variant === 'inline') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
          style={{ overflow: 'hidden' }}
          className={cn(className)}
        >
          <div className={cn('rounded-xl border p-4', bgColor)}>
            <div className="flex items-start gap-3">
              <div className={cn('flex-shrink-0 mt-0.5', iconColor)}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', textColor)}>{title}</p>
                <p className={cn('text-sm mt-1', textColor.replace('800', '700'))}>
                  {description}
                </p>
                {pendingCount.total > 0 && (
                  <p className="text-xs mt-2 text-warm-500">
                    {pendingCount.total} item{pendingCount.total !== 1 ? 's' : ''} waiting to sync
                  </p>
                )}
              </div>
              {dismissable && (
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss"
                  className={cn('flex-shrink-0 p-1 rounded-lg hover:bg-white/50 active:bg-white/70 transition-colors', iconColor)}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Feature list */}
            <div className="mt-3 pt-3 border-t border-current/10 flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-2">
                <CheckIcon className={cn('w-3.5 h-3.5', iconColor)} />
                <span className={textColor.replace('800', '600')}>Local storage</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className={cn('w-3.5 h-3.5', iconColor)} />
                <span className={textColor.replace('800', '600')}>Auto-sync</span>
              </div>
              <div className="flex items-center gap-2">
                <CloudSaveIcon className={cn('w-3.5 h-3.5', iconColor)} />
                <span className={textColor.replace('800', '600')}>Data preserved</span>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ============================================================================
  // FLOATING VARIANT
  // ============================================================================

  if (variant === 'floating') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={cn(
            'fixed left-4 right-4 z-50 md:left-auto md:right-4 md:w-96',
            'bottom-[var(--golf-mobile-bottom-nav-offset)] md:bottom-4',
            className
          )}
        >
          <div className={cn('rounded-xl border shadow-lg backdrop-blur-sm p-4', bgColor)}>
            <div className="flex items-start gap-3">
              <div className={cn('flex-shrink-0', iconColor)}>{icon}</div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', textColor)}>{title}</p>
                <p className={cn('text-xs mt-1', textColor.replace('800', '600'))}>
                  {description}
                </p>
              </div>
              {dismissable && (
                <button
                  onClick={handleDismiss}
                  aria-label="Dismiss"
                  className={cn('flex-shrink-0 p-1 rounded-lg hover:bg-white/50 active:bg-white/70 transition-colors', iconColor)}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ============================================================================
  // MODAL VARIANT
  // ============================================================================

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-900/50 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={cn('w-full max-w-md rounded-2xl bg-white shadow-xl', className)}
        >
          {/* Header */}
          <div className={cn('p-6 rounded-t-2xl', bgColor)}>
            <div className="flex items-center gap-3">
              <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', isOffline ? 'bg-amber-100' : 'bg-blue-100')}>
                <span className={iconColor}>{icon}</span>
              </div>
              <div>
                <h2 className={cn('text-lg font-semibold', textColor)}>{title}</h2>
                <p className={cn('text-sm', textColor.replace('800', '600'))}>
                  {isOffline ? 'Offline mode active' : 'Connection unstable'}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-warm-600 mb-4">{description}</p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <CheckIcon className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warm-900">Shots saved locally</p>
                  <p className="text-warm-500">All your shots are stored on this device</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <CheckIcon className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warm-900">Automatic sync</p>
                  <p className="text-warm-500">Data syncs within 5 seconds of reconnection</p>
                </div>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <CheckIcon className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-warm-900">No data loss</p>
                  <p className="text-warm-500">Your round persists through app close/reopen</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <button
              onClick={handleDismiss}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
            >
              Continue {context || 'tracking'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================
