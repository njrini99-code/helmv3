/**
 * Offline Sync Store for Golf Shot Tracking
 *
 * Zustand store that manages offline sync state across the application.
 * Provides a centralized state management for:
 * - Connection status
 * - Sync progress
 * - Pending items count
 * - Sync history
 * - UI notifications
 *
 * Features:
 * - Persistent state via localStorage
 * - Computed selectors for UI components
 * - Action creators for sync operations
 * - Integration with sync engine
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';

import {
  getSyncEngine,
  type SyncProgress,
  type SyncCallback,
} from '@/lib/offline/sync-engine';

import {
  getOfflineStats,
  isOfflineStorageAvailable,
  clearAllOfflineData,
  type SyncResult,
} from '@/lib/offline/shot-storage';

// ============================================================================
// TYPES
// ============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface PendingItem {
  id: string;
  type: 'round' | 'hole' | 'shot';
  description: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  error?: string;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  success: boolean;
  syncedCount: number;
  failedCount: number;
  duration: number;
  errors: string[];
}

export interface OfflineSyncState {
  // Connection
  isOnline: boolean;
  isSlowConnection: boolean;
  lastOnlineAt: string | null;
  connectionQuality: string | null;

  // Storage
  isStorageAvailable: boolean;
  storageUsed: number;
  storageQuota: number;

  // Sync status
  syncStatus: SyncStatus;
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncAttempt: string | null;
  lastSuccessfulSync: Date | null;
  syncError: string | null;

  // Engine ready state
  isReady: boolean;

  // Pending items
  pendingCount: {
    rounds: number;
    holes: number;
    shots: number;
    total: number;
  };
  failedCount: number;

  // History
  syncHistory: SyncHistoryEntry[];
  maxHistoryEntries: number;

  // UI state
  showOfflineBanner: boolean;
  showSyncProgress: boolean;
  notificationQueue: string[];
}

export interface OfflineSyncActions {
  // Connection actions
  setOnline: (isOnline: boolean) => void;
  setSlowConnection: (isSlow: boolean) => void;
  setConnectionStatus: (isOnline: boolean, quality: string) => void;

  // Storage actions
  checkStorageAvailability: () => Promise<void>;
  clearOfflineData: () => Promise<void>;

  // Sync actions
  startSync: () => Promise<SyncResult | null>;
  retrySync: () => Promise<SyncResult | null>;
  cancelSync: () => void;

  // Progress updates
  updateSyncProgress: (progress: SyncProgress) => void;
  updatePendingCount: () => Promise<void>;
  refreshPendingCounts: () => Promise<void>;

  // Sync completion
  onSyncComplete: (result: SyncResult) => void;
  onSyncError: (error: string) => void;
  completeSync: (success: boolean) => void;
  failSync: (error: string) => void;

  // Ready state
  setReady: (ready: boolean) => void;

  // UI actions
  showBanner: () => void;
  hideBanner: () => void;
  showProgress: () => void;
  hideProgress: () => void;
  addNotification: (message: string) => void;
  clearNotification: () => void;
  clearSyncError: () => void;
  clearError: () => void;

  // History
  addHistoryEntry: (entry: Omit<SyncHistoryEntry, 'id'>) => void;
  clearHistory: () => void;

  // Initialize
  initialize: () => Promise<void>;
  registerSyncCallbacks: () => void;
  cleanup: () => void;
}

export type OfflineSyncStore = OfflineSyncState & OfflineSyncActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: OfflineSyncState = {
  isOnline: true,
  isSlowConnection: false,
  lastOnlineAt: null,
  connectionQuality: null,

  isStorageAvailable: false,
  storageUsed: 0,
  storageQuota: 0,

  syncStatus: 'idle',
  isSyncing: false,
  syncProgress: null,
  lastSyncAttempt: null,
  lastSuccessfulSync: null,
  syncError: null,

  isReady: false,

  pendingCount: {
    rounds: 0,
    holes: 0,
    shots: 0,
    total: 0,
  },
  failedCount: 0,

  syncHistory: [],
  maxHistoryEntries: 50,

  showOfflineBanner: false,
  showSyncProgress: false,
  notificationQueue: [],
};

// ============================================================================
// STORE
// ============================================================================

export const useOfflineSyncStore = create<OfflineSyncStore>()(
  persist(
    immer((set, get) => {
      // Callback ID for sync engine
      const callbackId = 'offline-sync-store';

      return {
        ...initialState,

        // ====================================================================
        // CONNECTION ACTIONS
        // ====================================================================

        setOnline: (isOnline: boolean) => {
          set((state) => {
            state.isOnline = isOnline;
            if (isOnline) {
              state.lastOnlineAt = new Date().toISOString();
              state.syncStatus = state.pendingCount.total > 0 ? 'idle' : 'success';
            } else {
              state.syncStatus = 'offline';
              state.showOfflineBanner = true;
            }
          });

          // Auto-sync when coming back online
          if (isOnline && get().pendingCount.total > 0) {
            setTimeout(() => get().startSync(), 2000);
          }
        },

        setSlowConnection: (isSlow: boolean) => {
          set((state) => {
            state.isSlowConnection = isSlow;
          });
        },

        setConnectionStatus: (isOnline: boolean, quality: string) => {
          set((state) => {
            state.isOnline = isOnline;
            state.connectionQuality = quality;
            if (isOnline) {
              state.lastOnlineAt = new Date().toISOString();
              state.showOfflineBanner = false;
            } else {
              state.syncStatus = 'offline';
              state.showOfflineBanner = true;
            }
          });
        },

        // ====================================================================
        // STORAGE ACTIONS
        // ====================================================================

        checkStorageAvailability: async () => {
          try {
            const available = await isOfflineStorageAvailable();
            const stats = available ? await getOfflineStats() : null;

            set((state) => {
              state.isStorageAvailable = available;
              state.storageUsed = stats?.storageUsed || 0;
              state.storageQuota = stats?.storageQuota || 0;
            });
          } catch (error) {
            console.error('Failed to check storage availability:', error);
            set((state) => {
              state.isStorageAvailable = false;
            });
          }
        },

        clearOfflineData: async () => {
          try {
            await clearAllOfflineData();
            set((state) => {
              state.pendingCount = { rounds: 0, holes: 0, shots: 0, total: 0 };
              state.failedCount = 0;
              state.syncStatus = 'idle';
              state.syncError = null;
            });
            get().addNotification('Offline data cleared');
          } catch (error) {
            console.error('Failed to clear offline data:', error);
            get().addNotification('Failed to clear offline data');
          }
        },

        // ====================================================================
        // SYNC ACTIONS
        // ====================================================================

        startSync: async () => {
          const state = get();

          if (state.isSyncing) {
            return null;
          }

          if (!state.isOnline) {
            set((s) => {
              s.syncStatus = 'offline';
              s.syncError = 'Cannot sync while offline';
            });
            return null;
          }

          set((s) => {
            s.isSyncing = true;
            s.syncStatus = 'syncing';
            s.syncProgress = null;
            s.syncError = null;
            s.lastSyncAttempt = new Date().toISOString();
            s.showSyncProgress = true;
          });

          const startTime = Date.now();
          const engine = getSyncEngine();

          try {
            const result = await engine.syncNow();

            const duration = Date.now() - startTime;

            set((s) => {
              s.isSyncing = false;
              s.syncStatus = result.success ? 'success' : 'error';
              s.showSyncProgress = false;

              if (result.success && (result.syncedRounds > 0 || result.syncedHoles > 0 || result.syncedShots > 0)) {
                s.lastSuccessfulSync = new Date();
              }

              if (!result.success && result.errors.length > 0) {
                s.syncError = result.errors[0] ?? null;
              }
            });

            // Add to history
            get().addHistoryEntry({
              timestamp: new Date().toISOString(),
              success: result.success,
              syncedCount: result.syncedRounds + result.syncedHoles + result.syncedShots,
              failedCount: result.failedItems,
              duration,
              errors: result.errors,
            });

            // Refresh pending count
            await get().updatePendingCount();

            return result;

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';

            set((s) => {
              s.isSyncing = false;
              s.syncStatus = 'error';
              s.syncError = errorMessage;
              s.showSyncProgress = false;
            });

            return null;
          }
        },

        retrySync: async () => {
          const engine = getSyncEngine();

          set((s) => {
            s.syncError = null;
          });

          return engine.retryFailed().then((result) => {
            get().onSyncComplete(result);
            return result;
          });
        },

        cancelSync: () => {
          const engine = getSyncEngine();
          engine.stop();

          set((s) => {
            s.isSyncing = false;
            s.syncStatus = 'idle';
            s.syncProgress = null;
            s.showSyncProgress = false;
          });
        },

        // ====================================================================
        // PROGRESS UPDATES
        // ====================================================================

        updateSyncProgress: (progress: SyncProgress) => {
          set((state) => {
            state.syncProgress = progress;
          });
        },

        updatePendingCount: async () => {
          try {
            const stats = await getOfflineStats();

            set((state) => {
              state.pendingCount = {
                rounds: stats.pendingRounds,
                holes: stats.pendingHoles,
                shots: stats.pendingShots,
                total: stats.pendingRounds + stats.pendingHoles + stats.pendingShots,
              };
              state.failedCount = stats.failedItems;
              state.storageUsed = stats.storageUsed;
              state.storageQuota = stats.storageQuota;

              // Update banner visibility
              if (state.pendingCount.total === 0 && state.isOnline) {
                state.showOfflineBanner = false;
              }
            });
          } catch (error) {
            console.error('Failed to update pending count:', error);
          }
        },

        // Alias for updatePendingCount (for API compatibility)
        refreshPendingCounts: async () => {
          return get().updatePendingCount();
        },

        // ====================================================================
        // SYNC COMPLETION
        // ====================================================================

        onSyncComplete: (result: SyncResult) => {
          set((state) => {
            state.isSyncing = false;
            state.syncStatus = result.success ? 'success' : 'error';
            state.showSyncProgress = false;

            if (result.success) {
              state.lastSuccessfulSync = new Date();

              if (result.syncedRounds > 0 || result.syncedHoles > 0 || result.syncedShots > 0) {
                const total = result.syncedRounds + result.syncedHoles + result.syncedShots;
                state.notificationQueue.push(`Synced ${total} items`);
              }
            } else if (result.errors.length > 0) {
              state.syncError = result.errors[0] ?? null;
            }
          });

          // Refresh pending count
          get().updatePendingCount();
        },

        onSyncError: (error: string) => {
          set((state) => {
            state.isSyncing = false;
            state.syncStatus = 'error';
            state.syncError = error;
            state.showSyncProgress = false;
          });
        },

        // Simplified sync completion handler (for provider compatibility)
        completeSync: (success: boolean) => {
          set((state) => {
            state.isSyncing = false;
            state.syncStatus = success ? 'success' : 'error';
            state.showSyncProgress = false;
            if (success) {
              state.lastSuccessfulSync = new Date();
            }
          });
          // Refresh pending count
          get().updatePendingCount();
        },

        // Simplified sync failure handler (for provider compatibility)
        failSync: (error: string) => {
          set((state) => {
            state.isSyncing = false;
            state.syncStatus = 'error';
            state.syncError = error;
            state.showSyncProgress = false;
          });
        },

        // Set the ready state of the sync engine
        setReady: (ready: boolean) => {
          set((state) => {
            state.isReady = ready;
          });
        },

        // ====================================================================
        // UI ACTIONS
        // ====================================================================

        showBanner: () => {
          set((state) => {
            state.showOfflineBanner = true;
          });
        },

        hideBanner: () => {
          set((state) => {
            state.showOfflineBanner = false;
          });
        },

        showProgress: () => {
          set((state) => {
            state.showSyncProgress = true;
          });
        },

        hideProgress: () => {
          set((state) => {
            state.showSyncProgress = false;
          });
        },

        addNotification: (message: string) => {
          set((state) => {
            state.notificationQueue.push(message);
          });
        },

        clearNotification: () => {
          set((state) => {
            state.notificationQueue.shift();
          });
        },

        clearSyncError: () => {
          set((state) => {
            state.syncError = null;
            if (state.syncStatus === 'error') {
              state.syncStatus = 'idle';
            }
          });
        },

        // Alias for clearSyncError (for API compatibility)
        clearError: () => {
          set((state) => {
            state.syncError = null;
            if (state.syncStatus === 'error') {
              state.syncStatus = 'idle';
            }
          });
        },

        // ====================================================================
        // HISTORY
        // ====================================================================

        addHistoryEntry: (entry: Omit<SyncHistoryEntry, 'id'>) => {
          set((state) => {
            const newEntry: SyncHistoryEntry = {
              ...entry,
              id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            };

            state.syncHistory.unshift(newEntry);

            // Keep only max entries
            if (state.syncHistory.length > state.maxHistoryEntries) {
              state.syncHistory = state.syncHistory.slice(0, state.maxHistoryEntries);
            }
          });
        },

        clearHistory: () => {
          set((state) => {
            state.syncHistory = [];
          });
        },

        // ====================================================================
        // INITIALIZATION
        // ====================================================================

        initialize: async () => {
          // Check storage availability
          await get().checkStorageAvailability();

          // Set initial online status
          set((state) => {
            state.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
            state.lastOnlineAt = state.isOnline ? new Date().toISOString() : null;
          });

          // Update pending count
          await get().updatePendingCount();

          // Register sync callbacks
          get().registerSyncCallbacks();

          // Start sync engine
          const engine = getSyncEngine({
            autoSyncInterval: 30000,
            syncOnReconnect: true,
          });
          engine.start();
        },

        registerSyncCallbacks: () => {
          const engine = getSyncEngine();

          const callbacks: SyncCallback = {
            onSyncStart: () => {
              set((state) => {
                state.isSyncing = true;
                state.syncStatus = 'syncing';
              });
            },
            onSyncProgress: (progress) => {
              get().updateSyncProgress(progress);
            },
            onSyncComplete: (result) => {
              get().onSyncComplete(result);
            },
            onSyncError: (error) => {
              get().onSyncError(error.message);
            },
          };

          engine.registerCallback(callbackId, callbacks);
        },

        cleanup: () => {
          const engine = getSyncEngine();
          engine.unregisterCallback(callbackId);
          engine.stop();
        },
      };
    }),
    {
      name: 'golfhelm-offline-sync',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        lastOnlineAt: state.lastOnlineAt,
        lastSyncAttempt: state.lastSyncAttempt,
        lastSuccessfulSync: state.lastSuccessfulSync,
        syncHistory: state.syncHistory.slice(0, 10), // Keep only recent history
      }),
    }
  )
);

// ============================================================================
// SELECTORS
// ============================================================================

export const selectIsOffline = (state: OfflineSyncState) => !state.isOnline;
export const selectHasPendingItems = (state: OfflineSyncState) => state.pendingCount.total > 0;
export const selectShouldShowBanner = (state: OfflineSyncState) =>
  !state.isOnline || state.pendingCount.total > 0 || state.syncError !== null;
export const selectSyncProgress = (state: OfflineSyncState) => state.syncProgress;
export const selectPendingTotal = (state: OfflineSyncState) => state.pendingCount.total;

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to initialize the offline sync store
 */
export function useInitializeOfflineSync() {
  const initialize = useOfflineSyncStore((state) => state.initialize);
  const cleanup = useOfflineSyncStore((state) => state.cleanup);

  return { initialize, cleanup };
}

/**
 * Hook for offline sync status
 */
export function useOfflineSyncStatus() {
  return useOfflineSyncStore(
    useShallow((state) => ({
      isOnline: state.isOnline,
      isSyncing: state.isSyncing,
      syncStatus: state.syncStatus,
      pendingCount: state.pendingCount,
      lastSuccessfulSync: state.lastSuccessfulSync,
      syncError: state.syncError,
      isReady: state.isReady,
    }))
  );
}

/**
 * Hook for offline sync actions
 */
export function useOfflineSyncActions() {
  return useOfflineSyncStore(
    useShallow((state) => ({
      startSync: state.startSync,
      retrySync: state.retrySync,
      cancelSync: state.cancelSync,
      clearSyncError: state.clearSyncError,
      hideBanner: state.hideBanner,
      updatePendingCount: state.updatePendingCount,
      refreshPendingCounts: state.refreshPendingCounts,
    }))
  );
}
