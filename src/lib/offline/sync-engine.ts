/**
 * Sync Engine for Golf Shot Tracking Offline Support
 *
 * Handles synchronization of offline data with the server,
 * including conflict resolution, exponential backoff retries,
 * and background sync orchestration.
 *
 * Features:
 * - Background sync with configurable intervals
 * - Exponential backoff retry logic
 * - Server-wins conflict resolution for same IDs
 * - Merge strategy for new data
 * - Sync progress callbacks
 * - Error recovery and reporting
 */

import {
  getPendingRounds,
  getPendingHoles,
  getPendingShots,
  markRoundSynced,
  markRoundFailed,
  markHoleSynced,
  markHoleFailed,
  markShotSynced,
  markShotFailed,
  updateOfflineRound,
  updateOfflineHole,
  updateOfflineShot,
  setSyncMetadata,
  getSyncMetadata,
  clearSyncedData,
  shouldRetry,
  type OfflineRound,
  type OfflineHole,
  type OfflineShot,
  type SyncResult,
  type SyncStatus,
} from './shot-storage';

// Dynamic import to avoid lib/ → app/ circular dependency
type RoundDraftData = import('@/app/golf/actions/round-drafts').RoundDraftData;

// ============================================================================
// TYPES
// ============================================================================

export interface SyncCallback {
  onSyncStart?: () => void;
  onSyncProgress?: (progress: SyncProgress) => void;
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error) => void;
  onItemSynced?: (type: 'round' | 'hole' | 'shot', offlineId: string, serverId?: string) => void;
  onItemFailed?: (type: 'round' | 'hole' | 'shot', offlineId: string, error: string) => void;
  onConflictResolved?: (type: 'round' | 'hole' | 'shot', offlineId: string, resolution: 'server_wins' | 'merged') => void;
  /** Called when a conflict is detected and manual resolution is enabled */
  onConflictDetected?: (conflict: SyncConflict) => void;
}

/**
 * Represents a sync conflict between local and server data
 * Used for manual conflict resolution UI
 */
export interface SyncConflict {
  id: string;
  type: 'round' | 'hole' | 'shot';
  offlineId: string;
  localVersion: OfflineRound | OfflineHole | OfflineShot;
  serverVersion: Record<string, unknown> | null;
  localTimestamp: string;
  serverTimestamp: string;
  fieldDifferences: SyncFieldDifference[];
}

interface SyncFieldDifference {
  field: string;
  label: string;
  localValue: unknown;
  serverValue: unknown;
}

/**
 * Result of manual conflict resolution
 */
interface ManualConflictResolution {
  offlineId: string;
  resolution: 'local' | 'server' | 'merge';
  mergedData?: Record<string, unknown>;
}

export interface SyncProgress {
  phase: 'rounds' | 'holes' | 'shots' | 'cleanup';
  current: number;
  total: number;
  currentItem?: string;
  percentComplete: number;
}

interface SyncEngineConfig {
  /** Auto-sync interval in milliseconds (default: 30000 = 30s) */
  autoSyncInterval: number;
  /** Whether to sync immediately when online status changes (default: true) */
  syncOnReconnect: boolean;
  /** Maximum concurrent sync operations (default: 3) */
  maxConcurrent: number;
  /** Whether to auto-cleanup synced data (default: true) */
  autoCleanup: boolean;
  /** Sync callbacks */
  callbacks?: SyncCallback;
  /**
   * Enable manual conflict resolution UI instead of automatic server-wins
   * When true, conflicts will trigger onConflictDetected callback
   * and pause sync until resolved via resolveConflict()
   */
  enableManualConflictResolution?: boolean;
}

interface SyncEngineState {
  isOnline: boolean;
  isSyncing: boolean;
  /** Pending conflicts awaiting manual resolution */
  pendingConflicts: SyncConflict[];
  lastSyncAttempt: Date | null;
  lastSuccessfulSync: Date | null;
  pendingCount: {
    rounds: number;
    holes: number;
    shots: number;
    total: number;
  };
  failedCount: number;
  syncError: string | null;
  currentProgress: SyncProgress | null;
}

type ConflictResolution = 'server_wins' | 'client_wins' | 'merge';

// ============================================================================
// SYNC ENGINE CLASS
// ============================================================================

class SyncEngine {
  private config: SyncEngineConfig;
  private state: SyncEngineState;
  private callbacks: Map<string, SyncCallback> = new Map();
  private syncIntervalId: NodeJS.Timeout | null = null;
  private isSyncingFlag: boolean = false;
  private syncAbortController: AbortController | null = null;

  constructor(config: Partial<SyncEngineConfig> = {}) {
    this.config = {
      autoSyncInterval: 30000,
      syncOnReconnect: true,
      maxConcurrent: 3,
      autoCleanup: true,
      ...config,
    };

    this.state = {
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      pendingConflicts: [],
      lastSyncAttempt: null,
      lastSuccessfulSync: null,
      pendingCount: { rounds: 0, holes: 0, shots: 0, total: 0 },
      failedCount: 0,
      syncError: null,
      currentProgress: null,
    };

    // Set up online/offline listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));
    }

    // Load persisted sync metadata
    this.loadSyncMetadata();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start the sync engine with auto-sync interval
   */
  start(): void {
    if (this.syncIntervalId) {
      return; // Already started
    }

    this.syncIntervalId = setInterval(() => {
      if (this.state.isOnline && !this.isSyncingFlag) {
        this.syncPendingData();
      }
    }, this.config.autoSyncInterval);

    // Initial sync if online
    if (this.state.isOnline) {
      this.syncPendingData();
    }
  }

  /**
   * Initialize the sync engine
   * Loads persisted sync metadata, refreshes the pending count, and starts the engine.
   */
  async initialize(): Promise<void> {
    await this.loadSyncMetadata();
    await this.refreshPendingCount();
    this.start();
  }

  /**
   * Set all callbacks at once (convenience method for providers)
   */
  setCallbacks(callbacks: SyncCallback): void {
    // Store as config callbacks so they're used in notifyCallbacks
    this.config.callbacks = callbacks;
  }

  /**
   * Sync all pending data (alias for syncPendingData for API compatibility)
   */
  async syncAll(): Promise<SyncResult> {
    return this.syncPendingData();
  }

  /**
   * Stop auto-sync interval (alias for stop for API compatibility)
   */
  stopAutoSync(): void {
    this.stop();
  }

  /**
   * Stop the sync engine
   */
  stop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    if (this.syncAbortController) {
      this.syncAbortController.abort();
      this.syncAbortController = null;
    }
  }

  /**
   * Register a sync callback
   */
  registerCallback(id: string, callback: SyncCallback): void {
    this.callbacks.set(id, callback);
  }

  /**
   * Unregister a sync callback
   */
  unregisterCallback(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * Get current sync state
   */
  getState(): SyncEngineState {
    return { ...this.state };
  }

  /**
   * Manually trigger a sync
   */
  async syncNow(): Promise<SyncResult> {
    return this.syncPendingData();
  }

  /**
   * Retry failed items
   */
  async retryFailed(): Promise<SyncResult> {
    // Reset failed items to pending status
    const rounds = await getPendingRounds();
    const holes = await getPendingHoles();
    const shots = await getPendingShots();

    // Find and reset failed items
    for (const round of rounds) {
      if (round._sync_status === 'failed' && shouldRetry(round._retry_count, round._last_retry)) {
        await updateOfflineRound(round._offline_id, { _sync_status: 'pending' });
      }
    }

    for (const hole of holes) {
      if (hole._sync_status === 'failed' && shouldRetry(hole._retry_count, hole._last_retry)) {
        await updateOfflineHole(hole._offline_id, { _sync_status: 'pending' });
      }
    }

    for (const shot of shots) {
      if (shot._sync_status === 'failed' && shouldRetry(shot._retry_count, shot._last_retry)) {
        await updateOfflineShot(shot._offline_id, { _sync_status: 'pending' });
      }
    }

    return this.syncPendingData();
  }

  /**
   * Update pending counts
   */
  async refreshPendingCount(): Promise<void> {
    try {
      const rounds = await getPendingRounds();
      const holes = await getPendingHoles();
      const shots = await getPendingShots();

      // Include rounds stranded in the legacy v1 DB by saveOfflineRound
      // (failed-submit recovery). Graceful fallback keeps a v1 failure from
      // crashing the count.
      const legacyRounds = await import('./indexed-db')
        .then((m) => m.getPendingRoundCount())
        .catch(() => 0);

      const totalRounds = rounds.length + legacyRounds;

      this.state.pendingCount = {
        rounds: totalRounds,
        holes: holes.length,
        shots: shots.length,
        total: totalRounds + holes.length + shots.length,
      };
    } catch (error) {
      console.error('Failed to refresh pending count:', error);
    }
  }

  // ==========================================================================
  // SYNC LOGIC
  // ==========================================================================

  /**
   * Main sync function - syncs all pending data
   */
  async syncPendingData(): Promise<SyncResult> {
    if (this.isSyncingFlag) {
      return {
        success: false,
        syncedRounds: 0,
        syncedHoles: 0,
        syncedShots: 0,
        failedItems: 0,
        errors: ['Sync already in progress'],
      };
    }

    if (!this.state.isOnline) {
      return {
        success: false,
        syncedRounds: 0,
        syncedHoles: 0,
        syncedShots: 0,
        failedItems: 0,
        errors: ['Device is offline'],
      };
    }

    this.isSyncingFlag = true;
    this.state.isSyncing = true;
    this.state.syncError = null;
    this.state.lastSyncAttempt = new Date();
    this.syncAbortController = new AbortController();

    // Notify callbacks
    this.notifyCallbacks('onSyncStart');

    const result: SyncResult = {
      success: true,
      syncedRounds: 0,
      syncedHoles: 0,
      syncedShots: 0,
      failedItems: 0,
      errors: [],
    };

    try {
      // Sync rounds first (highest priority)
      const roundsResult = await this.syncRounds();
      result.syncedRounds = roundsResult.synced;
      result.failedItems += roundsResult.failed;
      result.errors.push(...roundsResult.errors);

      // Drain rounds stranded in the legacy v1 DB by saveOfflineRound
      // (failed-submit recovery). These would otherwise never auto-sync.
      const legacyRoundsResult = await this.syncV1Rounds();
      result.syncedRounds += legacyRoundsResult.synced;
      result.failedItems += legacyRoundsResult.failed;
      result.errors.push(...legacyRoundsResult.errors);

      // Then sync holes
      const holesResult = await this.syncHoles();
      result.syncedHoles = holesResult.synced;
      result.failedItems += holesResult.failed;
      result.errors.push(...holesResult.errors);

      // Finally sync shots
      const shotsResult = await this.syncShots();
      result.syncedShots = shotsResult.synced;
      result.failedItems += shotsResult.failed;
      result.errors.push(...shotsResult.errors);

      // Auto-cleanup if enabled
      if (this.config.autoCleanup) {
        await this.cleanup();
      }

      // Update metadata
      if (result.syncedRounds > 0 || result.syncedHoles > 0 || result.syncedShots > 0) {
        this.state.lastSuccessfulSync = new Date();
        await setSyncMetadata('lastSuccessfulSync', this.state.lastSuccessfulSync.toISOString());
      }

      await setSyncMetadata('lastSyncAttempt', this.state.lastSyncAttempt?.toISOString() || null);

      result.success = result.failedItems === 0;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      result.success = false;
      result.errors.push(errorMessage);
      this.state.syncError = errorMessage;

      this.notifyCallbacks('onSyncError', new Error(errorMessage));
    } finally {
      this.isSyncingFlag = false;
      this.state.isSyncing = false;
      this.state.currentProgress = null;
      this.syncAbortController = null;

      // Refresh pending count
      await this.refreshPendingCount();

      // Notify callbacks
      this.notifyCallbacks('onSyncComplete', result);
    }

    return result;
  }

  /**
   * Sync pending rounds
   */
  private async syncRounds(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const pendingRounds = await getPendingRounds();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < pendingRounds.length; i++) {
      if (this.syncAbortController?.signal.aborted) {
        break;
      }

      const round = pendingRounds[i];
      if (!round) continue;

      // Update progress
      this.updateProgress('rounds', i + 1, pendingRounds.length, round._offline_id);

      // Check if should retry based on backoff
      if (round._retry_count > 0 && !shouldRetry(round._retry_count, round._last_retry)) {
        continue;
      }

      try {
        // Mark as syncing
        await updateOfflineRound(round._offline_id, { _sync_status: 'syncing' });

        // Prepare draft data for server
        const draftData = this.prepareRoundDraftData(round);

        // Sync to server (dynamic import to avoid circular dependency)
        const { saveRoundDraft } = await import('@/app/golf/actions/round-drafts');
        const result = await saveRoundDraft(draftData, round._server_id);

        if (result.success) {
          await markRoundSynced(round._offline_id, result.data.roundId);
          synced++;
          this.notifyCallbacks('onItemSynced', 'round', round._offline_id, result.data.roundId);
        } else {
          await markRoundFailed(round._offline_id, result.error);
          failed++;
          errors.push(`Round ${round._offline_id}: ${result.error}`);
          this.notifyCallbacks('onItemFailed', 'round', round._offline_id, result.error);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await markRoundFailed(round._offline_id, errorMessage);
        failed++;
        errors.push(`Round ${round._offline_id}: ${errorMessage}`);
        this.notifyCallbacks('onItemFailed', 'round', round._offline_id, errorMessage);
      }

      // Small delay between operations
      await this.delay(100);
    }

    return { synced, failed, errors };
  }

  /**
   * Drain rounds stranded in the legacy v1 IndexedDB (golfhelm_offline).
   *
   * saveOfflineRound (failed-submit recovery in new-round-client) writes a
   * round here, but the rest of the sync pipeline reads the v2 store. This
   * step enumerates v1 pending rounds and pushes each to the server via the
   * same saveRoundDraft path used for v2 rounds, then marks them synced
   * NON-DESTRUCTIVELY (status flip + dequeue only, the row is retained and
   * later swept by normal cleanup) so a transient failure can never lose data.
   */
  private async syncV1Rounds(): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    let legacy: typeof import('./indexed-db');
    try {
      legacy = await import('./indexed-db');
    } catch {
      // v1 DB module unavailable — nothing to drain.
      return { synced, failed, errors };
    }

    let pendingRounds: Awaited<ReturnType<typeof legacy.getPendingRounds>>;
    try {
      pendingRounds = await legacy.getPendingRounds();
    } catch {
      // v1 DB unreadable (e.g. unsupported environment) — skip silently.
      return { synced, failed, errors };
    }

    const { saveRoundDraft } = await import('@/app/golf/actions/round-drafts');

    for (const round of pendingRounds) {
      if (this.syncAbortController?.signal.aborted) {
        break;
      }
      if (!round) continue;

      try {
        const draftData = {
          step: 'tracking' as const,
          setupData: {
            courseName: '',
            courseCity: '',
            courseState: '',
            courseRating: '',
            courseSlope: '',
            teesPlayed: '',
            roundType: 'practice' as const,
            roundDate: new Date().toISOString().split('T')[0] ?? '',
          },
          holes: [],
          completedHoleStats: [],
          currentHoleIndex: 0,
          // The recovery payload written by persistFailedSubmission is itself a
          // draft-shaped object; spread it over the defaults above.
          ...((round.draftData as Partial<RoundDraftData>) || {}),
        } as RoundDraftData;

        const result = await saveRoundDraft(draftData, round.serverRoundId);

        if (result.success) {
          // Non-destructive: flip status + dequeue, keep the row.
          await legacy.markOfflineRoundSynced(round.id, result.data.roundId);
          synced++;
          this.notifyCallbacks('onItemSynced', 'round', round.id, result.data.roundId);
        } else {
          failed++;
          errors.push(`Round ${round.id}: ${result.error}`);
          this.notifyCallbacks('onItemFailed', 'round', round.id, result.error);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failed++;
        errors.push(`Round ${round.id}: ${errorMessage}`);
        this.notifyCallbacks('onItemFailed', 'round', round.id, errorMessage);
      }

      await this.delay(100);
    }

    return { synced, failed, errors };
  }

  /**
   * Sync pending holes
   */
  private async syncHoles(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const pendingHoles = await getPendingHoles();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < pendingHoles.length; i++) {
      if (this.syncAbortController?.signal.aborted) {
        break;
      }

      const hole = pendingHoles[i];
      if (!hole) continue;

      // Update progress
      this.updateProgress('holes', i + 1, pendingHoles.length, hole._offline_id);

      // Check if should retry based on backoff
      if (hole._retry_count > 0 && !shouldRetry(hole._retry_count, hole._last_retry)) {
        continue;
      }

      try {
        // Holes are typically synced as part of round data
        // Mark as synced if the round was synced
        const roundSynced = await this.isRoundSynced(hole.round_offline_id);

        if (roundSynced) {
          await markHoleSynced(hole._offline_id);
          synced++;
          this.notifyCallbacks('onItemSynced', 'hole', hole._offline_id);
        } else {
          // Keep as pending until round syncs
          continue;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await markHoleFailed(hole._offline_id, errorMessage);
        failed++;
        errors.push(`Hole ${hole._offline_id}: ${errorMessage}`);
        this.notifyCallbacks('onItemFailed', 'hole', hole._offline_id, errorMessage);
      }
    }

    return { synced, failed, errors };
  }

  /**
   * Sync pending shots
   */
  private async syncShots(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const pendingShots = await getPendingShots();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < pendingShots.length; i++) {
      if (this.syncAbortController?.signal.aborted) {
        break;
      }

      const shot = pendingShots[i];
      if (!shot) continue;

      // Update progress
      this.updateProgress('shots', i + 1, pendingShots.length, shot._offline_id);

      // Check if should retry based on backoff
      if (shot._retry_count > 0 && !shouldRetry(shot._retry_count, shot._last_retry)) {
        continue;
      }

      try {
        // Shots are typically synced as part of round data
        // Mark as synced if the round was synced
        const roundSynced = await this.isRoundSynced(shot.round_offline_id);

        if (roundSynced) {
          await markShotSynced(shot._offline_id);
          synced++;
          this.notifyCallbacks('onItemSynced', 'shot', shot._offline_id);
        } else {
          // Keep as pending until round syncs
          continue;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await markShotFailed(shot._offline_id, errorMessage);
        failed++;
        errors.push(`Shot ${shot._offline_id}: ${errorMessage}`);
        this.notifyCallbacks('onItemFailed', 'shot', shot._offline_id, errorMessage);
      }
    }

    return { synced, failed, errors };
  }

  // ==========================================================================
  // CONFLICT RESOLUTION
  // ==========================================================================

  /**
   * Handle conflict between local and server data
   * Strategy: Server wins for same ID, merge for new data
   */
  handleConflict<T extends OfflineRound | OfflineHole | OfflineShot>(
    local: T,
    remote: Partial<T> | null,
    strategy: ConflictResolution = 'server_wins'
  ): T {
    // If no remote data, local wins
    if (!remote) {
      return local;
    }

    switch (strategy) {
      case 'server_wins':
        // Server data takes precedence, but preserve offline metadata
        return {
          ...remote,
          _offline_id: local._offline_id,
          _sync_status: 'synced' as SyncStatus,
          _created_offline: local._created_offline,
          _retry_count: local._retry_count,
          _conflict_resolved: true,
        } as T;

      case 'client_wins':
        // Local data takes precedence
        return {
          ...local,
          _conflict_resolved: true,
        };

      case 'merge': {
        // Merge strategy: combine data, preferring newer timestamps
        const localTime = new Date(local._created_offline).getTime();
        const remoteTime = remote._created_offline
          ? new Date(remote._created_offline as string).getTime()
          : 0;

        if (localTime > remoteTime) {
          return {
            ...remote,
            ...local,
            _conflict_resolved: true,
          };
        } else {
          return {
            ...local,
            ...remote,
            _offline_id: local._offline_id,
            _sync_status: 'synced' as SyncStatus,
            _created_offline: local._created_offline,
            _conflict_resolved: true,
          } as T;
        }
      }

      default:
        return local;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Check if a round has been synced
   */
  private async isRoundSynced(roundOfflineId: string): Promise<boolean> {
    try {
      const rounds = await getPendingRounds();
      const round = rounds.find(r => r._offline_id === roundOfflineId);
      return !round || round._sync_status === 'synced';
    } catch {
      return false;
    }
  }

  /**
   * Prepare round draft data for server sync
   */
  private prepareRoundDraftData(round: OfflineRound): RoundDraftData {
    return {
      step: 'tracking',
      setupData: {
        courseName: round.course_name || '',
        courseCity: round.course_city || '',
        courseState: round.course_state || '',
        courseRating: round.course_rating?.toString() || '',
        courseSlope: round.course_slope?.toString() || '',
        teesPlayed: round.tees_played || '',
        roundType: (round.round_type as 'practice' | 'tournament' | 'qualifier') || 'practice',
        roundDate: round.round_date ?? new Date().toISOString().split('T')[0] ?? '',
      },
      holes: [],
      completedHoleStats: [],
      currentHoleIndex: (round.current_hole || 1) - 1,
      ...(round.draft_data as Partial<RoundDraftData> || {}),
    };
  }

  /**
   * Update sync progress
   */
  private updateProgress(phase: SyncProgress['phase'], current: number, total: number, currentItem?: string): void {
    const progress: SyncProgress = {
      phase,
      current,
      total,
      currentItem,
      percentComplete: total > 0 ? Math.round((current / total) * 100) : 0,
    };

    this.state.currentProgress = progress;
    this.notifyCallbacks('onSyncProgress', progress);
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Load persisted sync metadata
   */
  private async loadSyncMetadata(): Promise<void> {
    try {
      const lastSyncAttempt = await getSyncMetadata<string>('lastSyncAttempt');
      const lastSuccessfulSync = await getSyncMetadata<string>('lastSuccessfulSync');

      if (lastSyncAttempt) {
        this.state.lastSyncAttempt = new Date(lastSyncAttempt);
      }
      if (lastSuccessfulSync) {
        this.state.lastSuccessfulSync = new Date(lastSuccessfulSync);
      }
    } catch (error) {
      console.error('Failed to load sync metadata:', error);
    }
  }

  /**
   * Cleanup old synced data
   */
  private async cleanup(): Promise<void> {
    try {
      this.updateProgress('cleanup', 1, 1, 'Cleaning up old data');
      await clearSyncedData();
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private handleOnline(): void {
    this.state.isOnline = true;

    if (this.config.syncOnReconnect && !this.isSyncingFlag) {
      // Delay sync slightly to allow network to stabilize
      setTimeout(() => {
        this.syncPendingData();
      }, 2000);
    }
  }

  private handleOffline(): void {
    this.state.isOnline = false;

    // Abort any in-progress sync
    if (this.syncAbortController) {
      this.syncAbortController.abort();
    }
  }

  // ==========================================================================
  // CALLBACK NOTIFICATIONS
  // ==========================================================================

  private notifyCallbacks(
    event: keyof SyncCallback,
    ...args: unknown[]
  ): void {
    // Notify config callback
    if (this.config.callbacks?.[event]) {
      try {
        (this.config.callbacks[event] as (...args: unknown[]) => void)?.(...args);
      } catch (error) {
        console.error(`Callback error (${event}):`, error);
      }
    }

    // Notify registered callbacks
     
    this.callbacks.forEach((callback, _id) => {
      if (callback[event]) {
        try {
          (callback[event] as (...args: unknown[]) => void)?.(...args);
        } catch (error) {
          console.error(`Callback error (${event}):`, error);
        }
      }
    });
  }

  // ==========================================================================
  // MANUAL CONFLICT RESOLUTION
  // ==========================================================================

  /**
   * Detect conflicts by comparing local and server versions
   * Returns field-by-field differences for UI display
   */
  detectConflict<T extends OfflineRound | OfflineHole | OfflineShot>(
    type: 'round' | 'hole' | 'shot',
    local: T,
    server: Record<string, unknown> | null
  ): SyncConflict | null {
    if (!server) return null;

    // Fields to compare for each type
    const fieldLabels: Record<string, string> = {
      // Round fields
      course_name: 'Course Name',
      round_date: 'Date',
      total_score: 'Total Score',
      total_putts: 'Total Putts',
      fairways_hit: 'Fairways Hit',
      greens_in_reg: 'Greens in Regulation',
      notes: 'Notes',
      // Hole fields
      hole_number: 'Hole Number',
      par: 'Par',
      score: 'Score',
      putts: 'Putts',
      fairway_hit: 'Fairway Hit',
      green_in_regulation: 'GIR',
      penalties: 'Penalties',
      // Shot fields
      shot_number: 'Shot Number',
      distance: 'Distance',
      result: 'Result',
      lie: 'Lie',
    };

    const differences: SyncFieldDifference[] = [];

    // Compare fields
    for (const [field, label] of Object.entries(fieldLabels)) {
      const localValue = (local as unknown as Record<string, unknown>)[field];
      const serverValue = server[field];

      // Skip metadata fields
      if (field.startsWith('_')) continue;

      // Check if values differ
      if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
        differences.push({
          field,
          label,
          localValue,
          serverValue,
        });
      }
    }

    // No conflict if no differences
    if (differences.length === 0) return null;

    return {
      id: crypto.randomUUID(),
      type,
      offlineId: local._offline_id,
      localVersion: local,
      serverVersion: server,
      localTimestamp: local._created_offline,
      serverTimestamp: (server.updated_at as string) || (server.created_at as string) || new Date().toISOString(),
      fieldDifferences: differences,
    };
  }

  /**
   * Resolve a conflict manually with the specified resolution strategy
   */
  async resolveConflict(
    resolution: ManualConflictResolution
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { offlineId, resolution: strategy, mergedData } = resolution;

      // Find the conflict in pending conflicts
      const conflictIndex = this.state.pendingConflicts.findIndex(
        (c) => c.offlineId === offlineId
      );

      if (conflictIndex === -1) {
        return { success: false, error: 'Conflict not found' };
      }

      const conflict = this.state.pendingConflicts[conflictIndex];
      if (!conflict) {
        return { success: false, error: 'Conflict not found' };
      }

      // Apply the resolution
      if (strategy === 'local') {
        // Keep local version, mark as synced with conflict resolved flag
        const localData = {
          ...conflict.localVersion,
          _sync_status: 'pending' as SyncStatus,
          _conflict_resolved: true,
        };

        // Update in IndexedDB based on type
        if (conflict.type === 'round') {
          await updateOfflineRound(offlineId, localData as Partial<OfflineRound>);
        } else if (conflict.type === 'hole') {
          await updateOfflineHole(offlineId, localData as Partial<OfflineHole>);
        } else if (conflict.type === 'shot') {
          await updateOfflineShot(offlineId, localData as Partial<OfflineShot>);
        }
      } else if (strategy === 'server') {
        // Accept server version, mark as synced
        const serverId = conflict.serverVersion?.id as string | undefined;
        if (conflict.type === 'round') {
          await markRoundSynced(offlineId, serverId);
        } else if (conflict.type === 'hole') {
          await markHoleSynced(offlineId, serverId);
        } else if (conflict.type === 'shot') {
          await markShotSynced(offlineId, serverId);
        }
      } else if (strategy === 'merge' && mergedData) {
        // Apply merged data
        const merged = {
          ...mergedData,
          _sync_status: 'pending' as SyncStatus,
          _conflict_resolved: true,
        };

        if (conflict.type === 'round') {
          await updateOfflineRound(offlineId, merged as Partial<OfflineRound>);
        } else if (conflict.type === 'hole') {
          await updateOfflineHole(offlineId, merged as Partial<OfflineHole>);
        } else if (conflict.type === 'shot') {
          await updateOfflineShot(offlineId, merged as Partial<OfflineShot>);
        }
      }

      // Remove from pending conflicts
      this.state.pendingConflicts.splice(conflictIndex, 1);

      // Notify resolution
      this.notifyCallbacks('onConflictResolved', conflict.type, offlineId, strategy === 'merge' ? 'merged' : 'server_wins');

      return { success: true };
    } catch (error) {
      console.error('Error resolving conflict:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all pending conflicts awaiting manual resolution
   */
  getPendingConflicts(): SyncConflict[] {
    return [...this.state.pendingConflicts];
  }

  /**
   * Clear all pending conflicts (use with caution)
   */
  clearPendingConflicts(): void {
    this.state.pendingConflicts = [];
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.stop();

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline.bind(this));
      window.removeEventListener('offline', this.handleOffline.bind(this));
    }

    this.callbacks.clear();
    this.state.pendingConflicts = [];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let syncEngineInstance: SyncEngine | null = null;

/**
 * Get the sync engine singleton instance
 */
export function getSyncEngine(config?: Partial<SyncEngineConfig>): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngine(config);
  }
  return syncEngineInstance;
}

// SyncEngine class and types are already exported above
