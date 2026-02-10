'use client';

/**
 * Offline Provider Component
 *
 * Initializes and manages the offline system for GolfHelm.
 * Provides context for offline state, connection monitoring, and sync actions.
 *
 * Features:
 * - Service worker registration
 * - Connection status monitoring
 * - Auto-sync on reconnection
 * - Sync status UI components
 */

import { useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useConnectionStatus, type ConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useServiceWorker } from '@/hooks/golf/use-service-worker';
import { useOfflineSyncStore, useOfflineSyncStatus, useOfflineSyncActions } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { OfflineSyncStatus } from './OfflineSyncStatus';
import { OfflineWarningBanner } from './OfflineWarningBanner';

// ============================================================================
// TYPES
// ============================================================================

interface OfflineContextValue {
  /** Connection status information */
  connection: ConnectionStatus;
  /** Whether the sync engine is ready */
  isReady: boolean;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Last successful sync time */
  lastSync: Date | null;
  /** Number of pending items to sync */
  pendingCount: {
    shots: number;
    holes: number;
    rounds: number;
    total: number;
  };
  /** Trigger immediate sync */
  syncNow: () => Promise<void>;
  /** Retry failed syncs */
  retryFailed: () => Promise<void>;
}

interface OfflineProviderProps {
  children: ReactNode;
  /** Whether to show the floating sync status UI */
  showSyncStatus?: boolean;
  /** Position of the sync status UI */
  syncStatusPosition?: 'floating' | 'inline' | 'sidebar';
  /** Whether to show offline warning banner */
  showWarningBanner?: boolean;
  /** Warning banner variant */
  warningBannerVariant?: 'inline' | 'floating' | 'modal';
  /** Context for the warning banner (e.g., "Starting a round") */
  warningContext?: string;
  /** Callback when connection status changes */
  onConnectionChange?: (isOnline: boolean) => void;
  /** Callback when sync completes */
  onSyncComplete?: (success: boolean, syncedCount: number) => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const OfflineContext = createContext<OfflineContextValue | null>(null);

/**
 * Hook to access offline context
 */
export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function OfflineProvider({
  children,
  showSyncStatus = true,
  syncStatusPosition = 'floating',
  showWarningBanner = true,
  warningBannerVariant = 'floating',
  warningContext,
  onConnectionChange,
  onSyncComplete,
}: OfflineProviderProps) {
  // Connection status
  const connectionStatus = useConnectionStatus();

  // Service worker - register and handle events
  useServiceWorker({
    immediate: true,
    onRegistered: () => {
      // Service worker registered successfully
    },
    onUpdateAvailable: () => {
      // Service worker update available
    },
  });

  // Zustand store
  const syncStatus = useOfflineSyncStatus();
  const syncActions = useOfflineSyncActions();

  // Initialize sync engine
  useEffect(() => {
    const initializeSyncEngine = async () => {
      try {
        const syncEngine = getSyncEngine();

        // Set up callbacks
        syncEngine.setCallbacks({
          onSyncStart: () => {
            useOfflineSyncStore.getState().startSync();
          },
          onSyncProgress: () => {
            // Could update progress in store if needed
          },
          onSyncComplete: (result) => {
            const syncedCount = result.syncedRounds + result.syncedHoles + result.syncedShots;
            useOfflineSyncStore.getState().completeSync(syncedCount > 0);
            onSyncComplete?.(syncedCount > 0, syncedCount);
          },
          onSyncError: (error) => {
            useOfflineSyncStore.getState().failSync(error.message);
          },
        });

        // Initialize the engine
        await syncEngine.initialize();

        useOfflineSyncStore.getState().setReady(true);

        // Refresh pending counts
        await syncActions.refreshPendingCounts();

        // Sync engine initialized
      } catch {
        // Failed to initialize sync engine - component will still render
      }
    };

    initializeSyncEngine();

    // Cleanup on unmount
    return () => {
      const syncEngine = getSyncEngine();
      syncEngine.stopAutoSync();
    };
  }, [syncActions, onSyncComplete]);

  // Handle connection changes
  useEffect(() => {
    const store = useOfflineSyncStore.getState();
    store.setConnectionStatus(connectionStatus.isOnline, connectionStatus.quality);

    onConnectionChange?.(connectionStatus.isOnline);

    // Auto-sync when coming back online
    if (connectionStatus.isOnline && syncStatus.pendingCount.total > 0) {
      // Small delay to let the connection stabilize
      const timeout = setTimeout(async () => {
        try {
          const syncEngine = getSyncEngine();
          await syncEngine.syncAll();
        } catch {
          // Auto-sync on reconnection failed - will retry on next connection change
        }
      }, 2000);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [connectionStatus.isOnline, connectionStatus.quality, syncStatus.pendingCount.total, onConnectionChange]);

  // Listen for service worker sync requests
  useEffect(() => {
    const handleSyncRequest = async () => {
      try {
        const syncEngine = getSyncEngine();
        await syncEngine.syncAll();
      } catch {
        // Service worker sync failed - will retry automatically
      }
    };

    window.addEventListener('sw-sync-requested', handleSyncRequest);

    return () => {
      window.removeEventListener('sw-sync-requested', handleSyncRequest);
    };
  }, []);

  // Sync action handlers
  const handleSyncNow = useCallback(async () => {
    try {
      const syncEngine = getSyncEngine();
      await syncEngine.syncAll();
    } catch {
      // Manual sync failed
    }
  }, []);

  const handleRetryFailed = useCallback(async () => {
    try {
      const syncEngine = getSyncEngine();
      await syncEngine.retryFailed();
    } catch {
      // Retry failed items failed
    }
  }, []);

  // Context value
  const contextValue: OfflineContextValue = {
    connection: connectionStatus,
    isReady: syncStatus.isReady,
    isSyncing: syncStatus.isSyncing,
    lastSync: syncStatus.lastSuccessfulSync,
    pendingCount: syncStatus.pendingCount,
    syncNow: handleSyncNow,
    retryFailed: handleRetryFailed,
  };

  return (
    <OfflineContext.Provider value={contextValue}>
      {children}

      {/* Sync Status UI */}
      {showSyncStatus && (
        <OfflineSyncStatus
          position={syncStatusPosition}
          showWhenOnline={false}
          autoHideDelay={5000}
        />
      )}

      {/* Warning Banner */}
      {showWarningBanner && (
        <OfflineWarningBanner
          variant={warningBannerVariant}
          showForSlowConnection={true}
          dismissable={true}
          context={warningContext}
        />
      )}
    </OfflineContext.Provider>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default OfflineProvider;
export type { OfflineContextValue, OfflineProviderProps };
