/**
 * IndexedDB Storage Layer for Golf Shot Tracking Offline Support
 *
 * Provides persistent offline storage for golf rounds and shots,
 * enabling players to continue tracking even without connectivity.
 *
 * Features:
 * - Shot queue for offline storage
 * - Round draft persistence
 * - Sync status tracking
 * - Automatic cleanup of old data
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OfflineShot {
  id: string; // Client-generated UUID
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  shotData: Record<string, unknown>;
  timestamp: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAttempt?: number;
  serverShotId?: string; // ID from server after successful sync
  error?: string;
}

export interface OfflineRound {
  id: string; // Client-generated UUID or server round ID
  playerId: string;
  draftData: Record<string, unknown>;
  timestamp: number;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAttempt?: number;
  serverRoundId?: string; // ID from server after successful sync
  error?: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'shot' | 'round';
  data: OfflineShot | OfflineRound;
  priority: number; // Lower = higher priority
  createdAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'golfhelm_offline';
const DB_VERSION = 1;

// Store names
const SHOTS_STORE = 'offline_shots';
const ROUNDS_STORE = 'offline_rounds';
const SYNC_QUEUE_STORE = 'sync_queue';

// Cleanup thresholds
const MAX_SYNC_ATTEMPTS = 5;
const SYNC_RETRY_DELAY_MS = 5000; // 5 seconds between retries
const DATA_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let dbInstance: IDBDatabase | null = null;

/**
 * Open or create the IndexedDB database
 */
export async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create shots store with indexes
      if (!db.objectStoreNames.contains(SHOTS_STORE)) {
        const shotsStore = db.createObjectStore(SHOTS_STORE, { keyPath: 'id' });
        shotsStore.createIndex('roundId', 'roundId', { unique: false });
        shotsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        shotsStore.createIndex('timestamp', 'timestamp', { unique: false });
        shotsStore.createIndex('holeNumber', 'holeNumber', { unique: false });
      }

      // Create rounds store with indexes
      if (!db.objectStoreNames.contains(ROUNDS_STORE)) {
        const roundsStore = db.createObjectStore(ROUNDS_STORE, { keyPath: 'id' });
        roundsStore.createIndex('playerId', 'playerId', { unique: false });
        roundsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        roundsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create sync queue store
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
        syncStore.createIndex('priority', 'priority', { unique: false });
        syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        syncStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// ============================================================================
// SHOT OPERATIONS
// ============================================================================

/**
 * Generate a unique client-side ID
 */
export function generateClientId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Save a shot to offline storage
 */
export async function saveOfflineShot(shot: Omit<OfflineShot, 'id' | 'timestamp' | 'syncStatus' | 'syncAttempts'>): Promise<OfflineShot> {
  const db = await openDatabase();

  const offlineShot: OfflineShot = {
    ...shot,
    id: generateClientId(),
    timestamp: Date.now(),
    syncStatus: 'pending',
    syncAttempts: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SHOTS_STORE, SYNC_QUEUE_STORE], 'readwrite');
    const shotsStore = transaction.objectStore(SHOTS_STORE);
    const syncStore = transaction.objectStore(SYNC_QUEUE_STORE);

    // Add to shots store
    const shotRequest = shotsStore.add(offlineShot);

    shotRequest.onsuccess = () => {
      // Add to sync queue
      const queueItem: SyncQueueItem = {
        id: offlineShot.id,
        type: 'shot',
        data: offlineShot,
        priority: 1, // Shots have medium priority
        createdAt: Date.now(),
      };

      syncStore.add(queueItem);
    };

    transaction.oncomplete = () => {
      resolve(offlineShot);
    };

    transaction.onerror = () => {
      reject(new Error('Failed to save offline shot'));
    };
  });
}

/**
 * Get all offline shots for a round
 */
export async function getOfflineShotsForRound(roundId: string): Promise<OfflineShot[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readonly');
    const store = transaction.objectStore(SHOTS_STORE);
    const index = store.index('roundId');
    const request = index.getAll(roundId);

    request.onsuccess = () => {
      const shots = request.result as OfflineShot[];
      // Sort by hole number and shot number
      shots.sort((a, b) => {
        if (a.holeNumber !== b.holeNumber) return a.holeNumber - b.holeNumber;
        return a.shotNumber - b.shotNumber;
      });
      resolve(shots);
    };

    request.onerror = () => {
      reject(new Error('Failed to get offline shots'));
    };
  });
}

/**
 * Get all pending shots (not yet synced)
 */
export async function getPendingShots(): Promise<OfflineShot[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readonly');
    const store = transaction.objectStore(SHOTS_STORE);
    const index = store.index('syncStatus');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const shots = request.result as OfflineShot[];
      // Sort by timestamp (oldest first for FIFO sync)
      shots.sort((a, b) => a.timestamp - b.timestamp);
      resolve(shots);
    };

    request.onerror = () => {
      reject(new Error('Failed to get pending shots'));
    };
  });
}

/**
 * Update shot sync status
 */
export async function updateShotSyncStatus(
  shotId: string,
  status: OfflineShot['syncStatus'],
  serverShotId?: string,
  error?: string
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readwrite');
    const store = transaction.objectStore(SHOTS_STORE);
    const getRequest = store.get(shotId);

    getRequest.onsuccess = () => {
      const shot = getRequest.result as OfflineShot;
      if (!shot) {
        reject(new Error('Shot not found'));
        return;
      }

      shot.syncStatus = status;
      shot.syncAttempts = status === 'syncing' ? shot.syncAttempts + 1 : shot.syncAttempts;
      shot.lastSyncAttempt = Date.now();
      if (serverShotId) shot.serverShotId = serverShotId;
      if (error) shot.error = error;

      store.put(shot);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to update shot sync status'));
  });
}

/**
 * Delete synced shots older than expiry threshold
 */
export async function cleanupSyncedShots(): Promise<number> {
  const db = await openDatabase();
  const expiryTime = Date.now() - DATA_EXPIRY_MS;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHOTS_STORE, 'readwrite');
    const store = transaction.objectStore(SHOTS_STORE);
    const index = store.index('syncStatus');
    const request = index.openCursor('synced');
    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const shot = cursor.value as OfflineShot;
        if (shot.timestamp < expiryTime) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve(deletedCount);
    transaction.onerror = () => reject(new Error('Failed to cleanup shots'));
  });
}

// ============================================================================
// ROUND OPERATIONS
// ============================================================================

/**
 * Save a round draft to offline storage
 */
export async function saveOfflineRound(round: Omit<OfflineRound, 'id' | 'timestamp' | 'syncStatus' | 'syncAttempts'> & { id?: string }): Promise<OfflineRound> {
  const db = await openDatabase();

  const offlineRound: OfflineRound = {
    ...round,
    id: round.id || generateClientId(),
    timestamp: Date.now(),
    syncStatus: 'pending',
    syncAttempts: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROUNDS_STORE, SYNC_QUEUE_STORE], 'readwrite');
    const roundsStore = transaction.objectStore(ROUNDS_STORE);
    const syncStore = transaction.objectStore(SYNC_QUEUE_STORE);

    // Use put to update existing or create new
    const roundRequest = roundsStore.put(offlineRound);

    roundRequest.onsuccess = () => {
      // Add/update in sync queue
      const queueItem: SyncQueueItem = {
        id: offlineRound.id,
        type: 'round',
        data: offlineRound,
        priority: 0, // Rounds have highest priority
        createdAt: Date.now(),
      };

      syncStore.put(queueItem);
    };

    transaction.oncomplete = () => {
      resolve(offlineRound);
    };

    transaction.onerror = () => {
      reject(new Error('Failed to save offline round'));
    };
  });
}

/**
 * Get an offline round by ID
 */
export async function getOfflineRound(roundId: string): Promise<OfflineRound | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readonly');
    const store = transaction.objectStore(ROUNDS_STORE);
    const request = store.get(roundId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('Failed to get offline round'));
    };
  });
}

/**
 * Get all offline rounds for a player
 */
export async function getOfflineRoundsForPlayer(playerId: string): Promise<OfflineRound[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readonly');
    const store = transaction.objectStore(ROUNDS_STORE);
    const index = store.index('playerId');
    const request = index.getAll(playerId);

    request.onsuccess = () => {
      const rounds = request.result as OfflineRound[];
      rounds.sort((a, b) => b.timestamp - a.timestamp); // Newest first
      resolve(rounds);
    };

    request.onerror = () => {
      reject(new Error('Failed to get offline rounds'));
    };
  });
}

/**
 * Get all pending rounds (not yet synced)
 */
export async function getPendingRounds(): Promise<OfflineRound[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readonly');
    const store = transaction.objectStore(ROUNDS_STORE);
    const index = store.index('syncStatus');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      const rounds = request.result as OfflineRound[];
      rounds.sort((a, b) => a.timestamp - b.timestamp); // FIFO
      resolve(rounds);
    };

    request.onerror = () => {
      reject(new Error('Failed to get pending rounds'));
    };
  });
}

/**
 * Update round sync status
 */
export async function updateRoundSyncStatus(
  roundId: string,
  status: OfflineRound['syncStatus'],
  serverRoundId?: string,
  error?: string
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROUNDS_STORE, 'readwrite');
    const store = transaction.objectStore(ROUNDS_STORE);
    const getRequest = store.get(roundId);

    getRequest.onsuccess = () => {
      const round = getRequest.result as OfflineRound;
      if (!round) {
        reject(new Error('Round not found'));
        return;
      }

      round.syncStatus = status;
      round.syncAttempts = status === 'syncing' ? round.syncAttempts + 1 : round.syncAttempts;
      round.lastSyncAttempt = Date.now();
      if (serverRoundId) round.serverRoundId = serverRoundId;
      if (error) round.error = error;

      store.put(round);
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to update round sync status'));
  });
}

/**
 * Delete an offline round and its shots
 */
export async function deleteOfflineRound(roundId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROUNDS_STORE, SHOTS_STORE, SYNC_QUEUE_STORE], 'readwrite');
    const roundsStore = transaction.objectStore(ROUNDS_STORE);
    const shotsStore = transaction.objectStore(SHOTS_STORE);
    const syncStore = transaction.objectStore(SYNC_QUEUE_STORE);

    // Delete the round
    roundsStore.delete(roundId);

    // Delete all shots for this round
    const shotsIndex = shotsStore.index('roundId');
    const shotsRequest = shotsIndex.openCursor(roundId);

    shotsRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        // Also remove from sync queue
        syncStore.delete(cursor.value.id);
        cursor.delete();
        cursor.continue();
      }
    };

    // Remove round from sync queue
    syncStore.delete(roundId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to delete offline round'));
  });
}

// ============================================================================
// SYNC QUEUE OPERATIONS
// ============================================================================

/**
 * Get next items to sync from the queue (ordered by priority and creation time)
 */
export async function getNextSyncItems(limit: number = 10): Promise<SyncQueueItem[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const index = store.index('priority');
    const request = index.getAll();

    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      // Sort by priority, then by creation time
      items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.createdAt - b.createdAt;
      });
      resolve(items.slice(0, limit));
    };

    request.onerror = () => {
      reject(new Error('Failed to get sync queue items'));
    };
  });
}

/**
 * Remove an item from the sync queue
 */
export async function removeSyncQueueItem(itemId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    store.delete(itemId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to remove sync queue item'));
  });
}

/**
 * Get the count of pending sync items
 */
export async function getPendingSyncCount(): Promise<{ shots: number; rounds: number; total: number }> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result as SyncQueueItem[];
      const shots = items.filter(i => i.type === 'shot').length;
      const rounds = items.filter(i => i.type === 'round').length;
      resolve({ shots, rounds, total: items.length });
    };

    request.onerror = () => {
      reject(new Error('Failed to get pending sync count'));
    };
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear all offline data
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SHOTS_STORE, ROUNDS_STORE, SYNC_QUEUE_STORE], 'readwrite');

    transaction.objectStore(SHOTS_STORE).clear();
    transaction.objectStore(ROUNDS_STORE).clear();
    transaction.objectStore(SYNC_QUEUE_STORE).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to clear offline data'));
  });
}

/**
 * Check if IndexedDB is available and working
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') {
    return false;
  }

  try {
    await openDatabase();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage usage estimate (if available)
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  DB_NAME,
  DB_VERSION,
  SHOTS_STORE,
  ROUNDS_STORE,
  SYNC_QUEUE_STORE,
  MAX_SYNC_ATTEMPTS,
  SYNC_RETRY_DELAY_MS,
  DATA_EXPIRY_MS,
};
