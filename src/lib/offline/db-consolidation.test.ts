/**
 * Regression test for the offline IndexedDB consolidation fix.
 *
 * Bug: two divergent offline databases existed — `golfhelm_offline` (v1,
 * written by saveOfflineRound on failed-submit recovery) and
 * `golfhelm_offline_v2` (read by getOfflineStats, the sync engine, and the
 * pending-count badge). A round stranded in v1 was never counted in the badge
 * and never auto-drained on reconnect.
 *
 * This proves the fix end-to-end through the REAL code paths:
 *   1. A round saved via the v1 saveOfflineRound is reflected in the pending
 *      count that the badge / auto-sync read (getOfflineStats().pendingRounds).
 *   2. The global sync engine drains that v1 round NON-DESTRUCTIVELY (the row
 *      is retained, status flipped to 'synced', dequeued) so a transient
 *      failure can never lose data.
 *
 * jsdom has no IndexedDB, so we install a minimal in-memory fake that supports
 * exactly the operations these modules use (add/put/get/delete/clear, plus
 * index getAll/count/openCursor by a single key value).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal in-memory IndexedDB fake
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeRequest<T>(getResult: () => T) {
  const req: {
    onsuccess: ((ev: { target: { result: T } }) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    result?: T;
    error?: unknown;
  } = { onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      req.result = getResult();
      req.onsuccess?.({ target: { result: req.result } });
    } catch (e) {
      req.error = e;
      req.onerror?.(e);
    }
  });
  return req;
}

class FakeIndex {
  constructor(private store: FakeObjectStore, private keyPath: string) {}
  private match(value: unknown): Row[] {
    return [...this.store.rows.values()].filter((r) => r[this.keyPath] === value);
  }
  getAll(value: unknown) {
    return makeRequest(() => this.match(value));
  }
  count(value: unknown) {
    return makeRequest(() => this.match(value).length);
  }
  openCursor(_value: unknown) {
    // Not exercised by the assertions below; return an immediately-null cursor.
    return makeRequest(() => null);
  }
}

class FakeObjectStore {
  rows = new Map<unknown, Row>();
  constructor(public keyPath: string) {}
  add(row: Row) {
    this.rows.set(row[this.keyPath], row);
    return makeRequest(() => row[this.keyPath]);
  }
  put(row: Row) {
    this.rows.set(row[this.keyPath], row);
    return makeRequest(() => row[this.keyPath]);
  }
  get(key: unknown) {
    return makeRequest(() => this.rows.get(key));
  }
  delete(key: unknown) {
    this.rows.delete(key);
    return makeRequest(() => undefined);
  }
  clear() {
    this.rows.clear();
    return makeRequest(() => undefined);
  }
  createIndex(_name: string, keyPath: string) {
    return new FakeIndex(this, keyPath);
  }
  index(keyPath: string) {
    return new FakeIndex(this, keyPath);
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(private db: FakeDB) {
    // Resolve after the synchronous body that created the transaction runs.
    queueMicrotask(() => queueMicrotask(() => this.oncomplete?.()));
  }
  objectStore(name: string) {
    return this.db.stores.get(name)!;
  }
}

class FakeDB {
  stores = new Map<string, FakeObjectStore>();
  objectStoreNames = {
    contains: (n: string) => this.stores.has(n),
    get length() {
      return 0;
    },
  };
  onversionchange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  createObjectStore(name: string, opts: { keyPath: string }) {
    const store = new FakeObjectStore(opts.keyPath);
    this.stores.set(name, store);
    // Make objectStoreNames.length reflect real store count for v2's
    // connection-liveness check.
    Object.defineProperty(this.objectStoreNames, 'length', {
      get: () => this.stores.size,
      configurable: true,
    });
    return store;
  }
  transaction(_names: string | string[], _mode?: string) {
    return new FakeTransaction(this);
  }
  close() {}
}

const databases = new Map<string, FakeDB>();

function installFakeIndexedDB() {
  const fake = {
    open(name: string, _version?: number) {
      const req: {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((ev: { target: { result: FakeDB }; oldVersion: number }) => void) | null;
        result?: FakeDB;
        error?: { message: string };
      } = { onsuccess: null, onerror: null, onupgradeneeded: null };

      queueMicrotask(() => {
        let db = databases.get(name);
        const isNew = !db;
        if (!db) {
          db = new FakeDB();
          databases.set(name, db);
        }
        req.result = db;
        if (isNew) {
          req.onupgradeneeded?.({ target: { result: db }, oldVersion: 0 });
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
  vi.stubGlobal('indexedDB', fake);
  // navigator.storage.estimate is read by getOfflineStats — make it benign.
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    storage: { estimate: async () => ({ usage: 0, quota: 0 }) },
    onLine: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('offline DB consolidation — v1 rounds count + drain', () => {
  beforeEach(() => {
    databases.clear();
    vi.resetModules();
    installFakeIndexedDB();
  });

  afterEach(async () => {
    try {
      const { resetSyncEngineForTests } = await import('./sync-engine');
      resetSyncEngineForTests();
    } catch {
      /* module may not be loaded */
    }
    vi.unstubAllGlobals();
  });

  it('a round saved via v1 saveOfflineRound is reflected in getOfflineStats().pendingRounds (the badge/auto-sync read)', async () => {
    const v1 = await import('./indexed-db');
    const shotStorage = await import('./shot-storage');

    // Baseline: v2 has nothing pending.
    const before = await shotStorage.getOfflineStats();
    expect(before.pendingRounds).toBe(0);

    // Simulate a failed-submit recovery write (new-round-client → v1 DB).
    await v1.saveOfflineRound({
      id: 'round-abc',
      playerId: '',
      draftData: { step: 'tracking', submissionIntent: 'submit' },
    });

    // The pending count the badge + auto-sync read MUST now include it.
    const after = await shotStorage.getOfflineStats();
    expect(after.pendingRounds).toBe(1);
  });

  it('getPendingRoundCount returns the count of pending v1 rounds', async () => {
    const v1 = await import('./indexed-db');
    expect(await v1.getPendingRoundCount()).toBe(0);
    await v1.saveOfflineRound({ id: 'r1', playerId: '', draftData: {} });
    await v1.saveOfflineRound({ id: 'r2', playerId: '', draftData: {} });
    expect(await v1.getPendingRoundCount()).toBe(2);
  });

  it('markOfflineRoundSynced is non-destructive: row retained, status synced, dequeued (no longer pending)', async () => {
    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({ id: 'round-xyz', playerId: '', draftData: {} });
    expect(await v1.getPendingRoundCount()).toBe(1);

    await v1.markOfflineRoundSynced('round-xyz', 'server-123');

    // No longer pending...
    expect(await v1.getPendingRoundCount()).toBe(0);
    // ...but the row is NOT deleted (data preserved).
    const db = databases.get('golfhelm_offline')!;
    const row = db.stores.get('offline_rounds')!.rows.get('round-xyz') as Row;
    expect(row).toBeTruthy();
    expect(row.syncStatus).toBe('synced');
    expect(row.serverRoundId).toBe('server-123');
    // Removed from the sync queue.
    expect(db.stores.get('sync_queue')!.rows.has('round-xyz')).toBe(false);
  });

  it('the global sync engine drains a v1 round through saveRoundDraft and counts it', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'server-round-1', lastAutoSave: '2026-06-14T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({
      id: 'round-drain',
      playerId: '',
      serverRoundId: '11111111-1111-1111-1111-111111111111',
      draftData: { step: 'tracking', setupData: { courseName: 'Pebble' } },
    });

    const { getSyncEngine } = await import('./sync-engine');
    const engine = getSyncEngine();
    const result = await engine.syncAll();

    // The v1 round was pushed to the server exactly once.
    expect(saveRoundDraft).toHaveBeenCalledTimes(1);
    expect(saveRoundDraft).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'tracking' }),
      '11111111-1111-1111-1111-111111111111'
    );
    // It is counted in the synced total and drained non-destructively.
    expect(result.syncedRounds).toBeGreaterThanOrEqual(1);
    expect(await v1.getPendingRoundCount()).toBe(0);
    const db = databases.get('golfhelm_offline')!;
    expect(db.stores.get('offline_rounds')!.rows.get('round-drain')).toBeTruthy();
  });

  it('a v1 round whose server push FAILS is recorded non-destructively: kept pending + retriable, attempt counted once', async () => {
    const saveRoundDraft = vi.fn(async () => ({ success: false as const, error: 'server boom' }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({
      id: 'round-fail',
      playerId: '',
      draftData: { step: 'tracking', setupData: { courseName: 'Pebble' } },
    });

    const { getSyncEngine } = await import('./sync-engine');
    const result = await getSyncEngine().syncAll();

    // Attempted exactly once — no immediate re-hammering within a single cycle.
    expect(saveRoundDraft).toHaveBeenCalledTimes(1);
    expect(result.failedItems).toBeGreaterThanOrEqual(1);

    // The round is NOT lost and stays retriable (pending), with the attempt counted.
    const db = databases.get('golfhelm_offline')!;
    const row = db.stores.get('offline_rounds')!.rows.get('round-fail') as Row;
    expect(row).toBeTruthy();
    expect(row.syncStatus).toBe('pending');
    expect(row.syncAttempts).toBe(1);
    expect(row.error).toBe('server boom');
    expect(await v1.getPendingRoundCount()).toBe(1);
  });

  it('a v1 round that has exhausted its retry budget is marked failed and NOT re-sent', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'srv', lastAutoSave: '2026-06-14T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const v1 = await import('./indexed-db');
    await v1.saveOfflineRound({ id: 'round-exhausted', playerId: '', draftData: { step: 'tracking' } });

    // Simulate a round that has already failed the maximum number of times
    // (MAX_RETRY_COUNT = 10), recently (so it is also inside the backoff window).
    const db = databases.get('golfhelm_offline')!;
    const seeded = db.stores.get('offline_rounds')!.rows.get('round-exhausted') as Row;
    seeded.syncAttempts = 10;
    seeded.lastSyncAttempt = Date.now();

    const { getSyncEngine } = await import('./sync-engine');
    await getSyncEngine().syncAll();

    // Budget spent: it must NOT be pushed to the server again...
    expect(saveRoundDraft).not.toHaveBeenCalled();
    // ...and it is surfaced as failed (no longer pending), with the row retained.
    const after = db.stores.get('offline_rounds')!.rows.get('round-exhausted') as Row;
    expect(after).toBeTruthy();
    expect(after.syncStatus).toBe('failed');
    expect(await v1.getPendingRoundCount()).toBe(0);
  });
});
