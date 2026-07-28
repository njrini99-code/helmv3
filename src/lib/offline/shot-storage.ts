/**
 * Shot Storage Layer for Complete Offline Golf Round Tracking
 *
 * Extended IndexedDB storage specifically for shots, holes, and rounds
 * with enhanced sync status tracking and offline-first capabilities.
 *
 * Features:
 * - Complete round storage with holes and shots
 * - Individual shot queuing with sync status
 * - Hole-level aggregation and tracking
 * - Optimistic sync with conflict resolution support
 * - Exponential backoff retry metadata
 */

import type { GolfShot, GolfHole, GolfRound } from '@/lib/types/golf';
import type { Json } from '@/lib/types/database';

// ============================================================================
// TYPES
// ============================================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

interface OfflineMetadata {
  _offline_id: string;
  _sync_status: SyncStatus;
  _created_offline: string; // ISO timestamp
  _retry_count: number;
  _last_retry?: string; // ISO timestamp
  _error_message?: string;
  _server_id?: string; // ID from server after sync
  _conflict_resolved?: boolean;
}

export interface OfflineShot extends Partial<GolfShot>, OfflineMetadata {
  hole_offline_id?: string;
  round_offline_id: string;
  shot_number: number;
  shot_type: string;
  club_type: string;
  result: string;
  distance_to_hole_before?: number | null;
  distance_to_hole_after?: number | null;
  shot_distance?: number | null;
  is_penalty?: boolean;
  penalty_type?: string | null;
  miss_direction?: string | null;
  lie_before?: string | null;
  distance_unit_before?: string | null;
  distance_unit_after?: string | null;
}

export interface OfflineHole extends Partial<GolfHole>, OfflineMetadata {
  round_offline_id: string;
  hole_number: number;
  par: number;
  yardage?: number | null;
  score?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  green_in_regulation?: boolean | null;
  driving_distance?: number | null;
  approach_proximity?: number | null;
  first_putt_distance?: number | null;
  scramble_attempt?: boolean | null;
  scramble_made?: boolean | null;
  sand_save_attempt?: boolean | null;
  sand_save_made?: boolean | null;
}

export interface OfflineRound extends Partial<GolfRound>, OfflineMetadata {
  player_id: string;
  course_name: string;
  course_city?: string | null;
  course_state?: string | null;
  course_rating?: number | null;
  course_slope?: number | null;
  tees_played?: string | null;
  round_type: string;
  round_date: string;
  total_score?: number | null;
  total_to_par?: number | null;
  total_putts?: number | null;
  fairways_hit?: number | null;
  greens_in_regulation?: number | null;
  holes_to_play: number;
  current_hole?: number | null;
  status: string;
  draft_data?: Json | null;
}

export interface SyncResult {
  success: boolean;
  syncedRounds: number;
  syncedHoles: number;
  syncedShots: number;
  failedItems: number;
  errors: string[];
}

interface OfflineStats {
  pendingRounds: number;
  pendingHoles: number;
  pendingShots: number;
  failedItems: number;
  lastSyncAttempt: string | null;
  lastSuccessfulSync: string | null;
  storageUsed: number;
  storageQuota: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'golfhelm_offline_v2';
const DB_VERSION = 2;

// Store names
const SHOTS_STORE = 'offline_shots';
const HOLES_STORE = 'offline_holes';
const ROUNDS_STORE = 'offline_rounds';
const SYNC_META_STORE = 'sync_metadata';

// Retry configuration (exponential backoff)
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 60000; // 60 seconds
export const MAX_RETRY_COUNT = 10;

// Cleanup
const DATA_EXPIRY_DAYS = 30;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

function isClosingConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'InvalidStateError'
    || /(?:connection|database).*(?:closed|closing)|(?:closed|closing).*(?:connection|database)/i.test(error.message);
}

function resetShotDatabase(expected?: IDBDatabase): void {
  if (expected && dbInstance !== expected) return;
  dbInstance = null;
  dbInitPromise = null;
}

/**
 * Open or create the IndexedDB database with all stores
 */
async function openShotDatabase(): Promise<IDBDatabase> {
  // Return existing instance if available and connection is still open
  if (dbInstance) {
    try {
      // `objectStoreNames` remains readable on a closing connection in real
      // browsers, so it is not a liveness check. Transaction creation is the
      // first operation IndexedDB rejects with InvalidStateError.
      dbInstance.transaction(SYNC_META_STORE, 'readonly');
      return dbInstance;
    } catch (error) {
      if (!isClosingConnectionError(error)) throw error;
      // Connection is stale/closed, reset and reopen
      resetShotDatabase(dbInstance);
    }
  }

  // Return pending promise if initialization is in progress
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInitPromise = null;
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      const opened = request.result;
      dbInstance = opened;

      // IDBDatabase.onerror receives an Event whose target is the failed
      // IDBRequest. Logging the Event itself stringifies to "[object Event]",
      // which hides the request's DOMException and creates an unactionable
      // Sentry issue. Log the actual request error instead.
      opened.onerror = (event) => {
        const requestError = (event.target as IDBRequest | null)?.error;
        console.error(
          'Database error:',
          requestError ?? new Error('IndexedDB request failed without an error detail'),
        );
      };

      // Handle version change (another tab upgraded the DB)
      opened.onversionchange = () => {
        opened.close();
        resetShotDatabase(opened);
      };

      resolve(opened);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // Create or upgrade stores
      if (oldVersion < 1) {
        // Shots store
        if (!db.objectStoreNames.contains(SHOTS_STORE)) {
          const shotsStore = db.createObjectStore(SHOTS_STORE, { keyPath: '_offline_id' });
          shotsStore.createIndex('round_offline_id', 'round_offline_id', { unique: false });
          shotsStore.createIndex('hole_offline_id', 'hole_offline_id', { unique: false });
          shotsStore.createIndex('_sync_status', '_sync_status', { unique: false });
          shotsStore.createIndex('_created_offline', '_created_offline', { unique: false });
          shotsStore.createIndex('shot_number', 'shot_number', { unique: false });
        }

        // Holes store
        if (!db.objectStoreNames.contains(HOLES_STORE)) {
          const holesStore = db.createObjectStore(HOLES_STORE, { keyPath: '_offline_id' });
          holesStore.createIndex('round_offline_id', 'round_offline_id', { unique: false });
          holesStore.createIndex('hole_number', 'hole_number', { unique: false });
          holesStore.createIndex('_sync_status', '_sync_status', { unique: false });
          holesStore.createIndex('_created_offline', '_created_offline', { unique: false });
        }

        // Rounds store
        if (!db.objectStoreNames.contains(ROUNDS_STORE)) {
          const roundsStore = db.createObjectStore(ROUNDS_STORE, { keyPath: '_offline_id' });
          roundsStore.createIndex('player_id', 'player_id', { unique: false });
          roundsStore.createIndex('_sync_status', '_sync_status', { unique: false });
          roundsStore.createIndex('_created_offline', '_created_offline', { unique: false });
          roundsStore.createIndex('round_date', 'round_date', { unique: false });
        }

        // Sync metadata store
        if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
          db.createObjectStore(SYNC_META_STORE, { keyPath: 'key' });
        }
      }

      // Version 2 upgrades
      if (oldVersion < 2) {
        // Add any new indexes or stores for v2
        // For now, v2 is structurally the same as v1
      }
    };
  });

  return dbInitPromise;
}

/**
 * Create a transaction, reopening once when another tab closes/upgrades the
 * cached connection between `openShotDatabase()` and `transaction()`.
 *
 * Only transaction SETUP is retried. Request/transaction failures after work
 * begins are left to the caller, so writes are never replayed ambiguously.
 */
async function openShotTransaction(
  stores: string | string[],
  mode: IDBTransactionMode,
): Promise<IDBTransaction> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await openShotDatabase();
    try {
      return db.transaction(stores, mode);
    } catch (error) {
      if (attempt > 0 || !isClosingConnectionError(error)) throw error;
      resetShotDatabase(db);
    }
  }
  throw new Error('Failed to open IndexedDB transaction');
}

// ============================================================================
// SHOT OPERATIONS
// ============================================================================

/**
 * Update an existing offline shot
 */
export async function updateOfflineShot(
  offlineId: string,
  updates: Partial<OfflineShot>
): Promise<OfflineShot> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readwrite');
    const store = transaction.objectStore(SHOTS_STORE);

    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineShot | undefined;
      if (!existing) {
        reject(new Error('Shot not found'));
        return;
      }

      const updated: OfflineShot = { ...existing, ...updates };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(new Error('Failed to update shot'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get shot'));
  });
}

/**
 * Get all pending shots
 */
export async function getPendingShots(): Promise<OfflineShot[]> {
  const transaction = await openShotTransaction(SHOTS_STORE, 'readonly');

  return new Promise((resolve, reject) => {
    const store = transaction.objectStore(SHOTS_STORE);
    const index = store.index('_sync_status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const shots = request.result as OfflineShot[];
      shots.sort((a, b) =>
        new Date(a._created_offline).getTime() - new Date(b._created_offline).getTime()
      );
      resolve(shots);
    };

    request.onerror = () => reject(new Error(`Failed to get pending shots: ${request.error?.message || 'unknown error'}`));
  });
}

/**
 * Mark a shot as synced
 */
export async function markShotSynced(offlineId: string, serverId?: string): Promise<void> {
  await updateOfflineShot(offlineId, {
    _sync_status: 'synced',
    _server_id: serverId,
  });
}

/**
 * Mark a shot as failed
 */
export async function markShotFailed(offlineId: string, errorMessage: string): Promise<void> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readwrite');
    const store = transaction.objectStore(SHOTS_STORE);
    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const shot = getRequest.result as OfflineShot | undefined;
      if (!shot) {
        reject(new Error('Shot not found'));
        return;
      }

      shot._sync_status = 'failed';
      shot._error_message = errorMessage;
      shot._retry_count = (shot._retry_count || 0) + 1;
      shot._last_retry = new Date().toISOString();

      store.put(shot);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to mark shot as failed'));
  });
}

// ============================================================================
// HOLE OPERATIONS
// ============================================================================

/**
 * Update an existing offline hole
 */
export async function updateOfflineHole(
  offlineId: string,
  updates: Partial<OfflineHole>
): Promise<OfflineHole> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HOLES_STORE, 'readwrite');
    const store = transaction.objectStore(HOLES_STORE);
    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineHole | undefined;
      if (!existing) {
        reject(new Error('Hole not found'));
        return;
      }

      const updated: OfflineHole = { ...existing, ...updates };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(new Error('Failed to update hole'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get hole'));
  });
}

/**
 * Get all pending holes
 */
export async function getPendingHoles(): Promise<OfflineHole[]> {
  const transaction = await openShotTransaction(HOLES_STORE, 'readonly');

  return new Promise((resolve, reject) => {
    const store = transaction.objectStore(HOLES_STORE);
    const index = store.index('_sync_status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const holes = request.result as OfflineHole[];
      holes.sort((a, b) =>
        new Date(a._created_offline).getTime() - new Date(b._created_offline).getTime()
      );
      resolve(holes);
    };

    request.onerror = () => reject(new Error(`Failed to get pending holes: ${request.error?.message || 'unknown error'}`));
  });
}

/**
 * Mark a hole as synced
 */
export async function markHoleSynced(offlineId: string, serverId?: string): Promise<void> {
  await updateOfflineHole(offlineId, {
    _sync_status: 'synced',
    _server_id: serverId,
  });
}

/**
 * Mark a hole as failed
 */
export async function markHoleFailed(offlineId: string, errorMessage: string): Promise<void> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HOLES_STORE, 'readwrite');
    const store = transaction.objectStore(HOLES_STORE);
    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const hole = getRequest.result as OfflineHole | undefined;
      if (!hole) {
        reject(new Error('Hole not found'));
        return;
      }

      hole._sync_status = 'failed';
      hole._error_message = errorMessage;
      hole._retry_count = (hole._retry_count || 0) + 1;
      hole._last_retry = new Date().toISOString();

      store.put(hole);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to mark hole as failed'));
  });
}

// ============================================================================
// ROUND OPERATIONS
// ============================================================================

/**
 * Update an existing offline round
 */
export async function updateOfflineRound(
  offlineId: string,
  updates: Partial<OfflineRound>
): Promise<OfflineRound> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readwrite');
    const store = transaction.objectStore(ROUNDS_STORE);
    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineRound | undefined;
      if (!existing) {
        reject(new Error('Round not found'));
        return;
      }

      const updated: OfflineRound = { ...existing, ...updates };
      const putRequest = store.put(updated);

      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(new Error('Failed to update round'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get round'));
  });
}

/**
 * Get all pending rounds
 */
export async function getPendingRounds(): Promise<OfflineRound[]> {
  const transaction = await openShotTransaction(ROUNDS_STORE, 'readonly');

  return new Promise((resolve, reject) => {
    const store = transaction.objectStore(ROUNDS_STORE);
    const index = store.index('_sync_status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const rounds = request.result as OfflineRound[];
      rounds.sort((a, b) =>
        new Date(a._created_offline).getTime() - new Date(b._created_offline).getTime()
      );
      resolve(rounds);
    };

    request.onerror = () => reject(new Error(`Failed to get pending rounds: ${request.error?.message || 'unknown error'}`));
  });
}

/**
 * Mark a round as synced
 */
export async function markRoundSynced(offlineId: string, serverId?: string): Promise<void> {
  await updateOfflineRound(offlineId, {
    _sync_status: 'synced',
    _server_id: serverId,
  });
}

/**
 * Mark a round as failed
 */
export async function markRoundFailed(offlineId: string, errorMessage: string): Promise<void> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readwrite');
    const store = transaction.objectStore(ROUNDS_STORE);
    const getRequest = store.get(offlineId);

    getRequest.onsuccess = () => {
      const round = getRequest.result as OfflineRound | undefined;
      if (!round) {
        reject(new Error('Round not found'));
        return;
      }

      round._sync_status = 'failed';
      round._error_message = errorMessage;
      round._retry_count = (round._retry_count || 0) + 1;
      round._last_retry = new Date().toISOString();

      store.put(round);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to mark round as failed'));
  });
}

// ============================================================================
// SYNC METADATA OPERATIONS
// ============================================================================

interface SyncMetadata {
  key: string;
  value: unknown;
}

/**
 * Set a sync metadata value
 */
export async function setSyncMetadata(key: string, value: unknown): Promise<void> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_META_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_META_STORE);
    store.put({ key, value });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to set sync metadata'));
  });
}

/**
 * Get a sync metadata value
 */
export async function getSyncMetadata<T>(key: string): Promise<T | null> {
  const transaction = await openShotTransaction(SYNC_META_STORE, 'readonly');

  return new Promise((resolve, reject) => {
    const store = transaction.objectStore(SYNC_META_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const result = request.result as SyncMetadata | undefined;
      resolve(result ? (result.value as T) : null);
    };

    request.onerror = () => reject(new Error('Failed to get sync metadata'));
  });
}

// ============================================================================
// AGGREGATE OPERATIONS
// ============================================================================

/**
 * Get offline stats for the current state
 */
export async function getOfflineStats(): Promise<OfflineStats> {
  // Fetch pending items with graceful fallbacks - one failure shouldn't crash stats
  const [pendingRounds, pendingHoles, pendingShots] = await Promise.all([
    getPendingRounds().catch(() => [] as OfflineRound[]),
    getPendingHoles().catch(() => [] as OfflineHole[]),
    getPendingShots().catch(() => [] as OfflineShot[]),
  ]);

  // Also count rounds stranded in the legacy v1 database by saveOfflineRound
  // (failed-submit recovery writes there). Without this, a round that fails to
  // submit on a flaky connection shows zero pending in the badge. Graceful
  // fallback: a v1 failure must never crash v2 stats.
  const legacyPendingRounds = await import('./indexed-db')
    .then((m) => m.getPendingRoundCount())
    .catch(() => 0);

  // Count failed items
  const getFailedCount = async (store: string): Promise<number> => {
    const transaction = await openShotTransaction(store, 'readonly');
    return new Promise((resolve) => {
      const objectStore = transaction.objectStore(store);
      const index = objectStore.index('_sync_status');
      const request = index.count('failed');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  };

  const [failedRounds, failedHoles, failedShots] = await Promise.all([
    getFailedCount(ROUNDS_STORE),
    getFailedCount(HOLES_STORE),
    getFailedCount(SHOTS_STORE),
  ]);

  const lastSyncAttempt = await getSyncMetadata<string>('lastSyncAttempt');
  const lastSuccessfulSync = await getSyncMetadata<string>('lastSuccessfulSync');

  // Get storage estimate
  let storageUsed = 0;
  let storageQuota = 0;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageUsed = estimate.usage || 0;
      storageQuota = estimate.quota || 0;
    } catch {
      // Ignore storage estimate errors
    }
  }

  return {
    pendingRounds: pendingRounds.length + legacyPendingRounds,
    pendingHoles: pendingHoles.length,
    pendingShots: pendingShots.length,
    failedItems: failedRounds + failedHoles + failedShots,
    lastSyncAttempt,
    lastSuccessfulSync,
    storageUsed,
    storageQuota,
  };
}

/**
 * Clear all synced data older than expiry threshold
 */
export async function clearSyncedData(): Promise<{ cleared: number }> {
  const db = await openShotDatabase();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - DATA_EXPIRY_DAYS);
  const expiryTimestamp = expiryDate.toISOString();

  let clearedCount = 0;

  const clearStore = (storeName: string): Promise<number> => {
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const index = store.index('_sync_status');
      const request = index.openCursor('synced');
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const item = cursor.value;
          if (item._created_offline < expiryTimestamp) {
            cursor.delete();
            count++;
          }
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(count);
      transaction.onerror = () => resolve(0);
    });
  };

  const [clearedRounds, clearedHoles, clearedShots] = await Promise.all([
    clearStore(ROUNDS_STORE),
    clearStore(HOLES_STORE),
    clearStore(SHOTS_STORE),
  ]);

  clearedCount = clearedRounds + clearedHoles + clearedShots;

  return { cleared: clearedCount };
}

/**
 * Clear all offline data
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await openShotDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [ROUNDS_STORE, HOLES_STORE, SHOTS_STORE, SYNC_META_STORE],
      'readwrite'
    );

    transaction.objectStore(ROUNDS_STORE).clear();
    transaction.objectStore(HOLES_STORE).clear();
    transaction.objectStore(SHOTS_STORE).clear();
    transaction.objectStore(SYNC_META_STORE).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to clear offline data'));
  });
}

/**
 * Check if IndexedDB is available
 */
export async function isOfflineStorageAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }

  try {
    await openShotDatabase();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// RETRY HELPERS
// ============================================================================

/**
 * Calculate exponential backoff delay
 */
function calculateRetryDelay(retryCount: number): number {
  const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Check if an item should be retried
 */
export function shouldRetry(retryCount: number, lastRetry?: string): boolean {
  if (retryCount >= MAX_RETRY_COUNT) {
    return false;
  }

  if (!lastRetry) {
    return true;
  }

  const delay = calculateRetryDelay(retryCount);
  const nextRetryTime = new Date(lastRetry).getTime() + delay;

  return Date.now() >= nextRetryTime;
}

// ============================================================================
// EXPORTS
// ============================================================================
