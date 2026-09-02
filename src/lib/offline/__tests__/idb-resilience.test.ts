/**
 * Regression tests for two offline-sync IndexedDB failure modes reported from
 * production (one Capacitor-iOS user, plus 5 device-level events):
 *
 *   (a) TRANSACTION-LIFECYCLE RACE. "Attempt to get a record / get all index
 *       records from database without an in-progress transaction" and
 *       "Failed to get sync metadata". The old helper shape —
 *       `const transaction = await openShotTransaction(...)`, then place the
 *       first request on it inside a LATER `new Promise(...)` — handed an
 *       already-created `IDBTransaction` back across an `await`. Safari/WebKit
 *       auto-commits a transaction once its request queue goes empty, and is
 *       measurably stricter than Chromium about how many microtask ticks it
 *       tolerates before treating an idle transaction as finished. The fix
 *       (`withShotTransaction`/`withTransaction`) places the first request on
 *       the transaction SYNCHRONOUSLY, in the same tick it was created.
 *
 *   (b) DEVICE-LEVEL OPEN FAILURE. "Failed to open IndexedDB: Internal error
 *       opening backing store" (WebKit storage-eviction/quota quirks). This
 *       does not resolve mid-session, so retrying on every hook remount just
 *       repeats the same OS-level failure and re-logs it. The fix caches the
 *       failure after the first `indexedDB.open()` error and fails fast + logs
 *       exactly once for the rest of the tab's session.
 *
 * jsdom has no IndexedDB — every scenario here installs a purpose-built fake
 * via `vi.stubGlobal('indexedDB', ...)` rather than a real browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: mocks.logError }));

// ---------------------------------------------------------------------------
// (b) Device-level open failure — a stub `indexedDB.open` that always errors.
// ---------------------------------------------------------------------------

function stubAlwaysFailingOpen(): { openCalls: number } {
  const counter = { openCalls: 0 };
  vi.stubGlobal('indexedDB', {
    open() {
      counter.openCalls++;
      const req: {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: (() => void) | null;
        error?: { message: string };
      } = { onsuccess: null, onerror: null, onupgradeneeded: null };
      req.error = { message: 'Internal error opening backing store.' };
      queueMicrotask(() => req.onerror?.());
      return req;
    },
  });
  return counter;
}

// ---------------------------------------------------------------------------
// (a) Transaction-lifecycle race — a fake DB whose transaction "auto-commits"
// (throws InvalidStateError from objectStore()) after exactly one microtask
// tick past creation. Old code (transaction handed back across an extra
// `await`) hits that tick before placing its first request; the fix places
// the request in the SAME tick the transaction was created.
// ---------------------------------------------------------------------------

function makeRequest<T>(getResult: () => T) {
  const req: { onsuccess: (() => void) | null; onerror: (() => void) | null; result?: T; error?: unknown } = {
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    try {
      req.result = getResult();
      req.onsuccess?.();
    } catch (e) {
      req.error = e;
      req.onerror?.();
    }
  });
  return req;
}

class DyingTransaction {
  private alive = true;
  constructor() {
    // Dies the moment ANY microtask boundary is crossed after creation —
    // models Safari's stricter auto-commit timing without needing a real
    // browser. The fix places its first request in the SAME synchronous
    // tick as `db.transaction(...)`, so it never observes this; the old
    // shape (transaction handed back across an `await`) always does.
    queueMicrotask(() => {
      this.alive = false;
    });
  }
  objectStore(_name: string) {
    if (!this.alive) {
      const err = new Error("Failed to execute 'get' on 'IDBObjectStore': The transaction has finished.");
      err.name = 'InvalidStateError';
      throw err;
    }
    return {
      get: (_key: string) => makeRequest(() => undefined),
      index: (_indexName: string) => ({
        getAll: (_value: string) => makeRequest(() => [] as unknown[]),
        count: (_value: string) => makeRequest(() => 0),
      }),
    };
  }
}

class RaceFakeDB {
  transactionCalls = 0;
  objectStoreNames = { contains: () => true, length: 1 };
  transaction(_stores: unknown, _mode: unknown) {
    this.transactionCalls++;
    return new DyingTransaction();
  }
  close() {}
}

function stubIndexedDBWithRaceFakeDB(): RaceFakeDB {
  const db = new RaceFakeDB();
  vi.stubGlobal('indexedDB', {
    open() {
      const req: { onsuccess: (() => void) | null; onerror: (() => void) | null; result?: RaceFakeDB } = {
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  });
  return db;
}

// WebKit can report an inactive transaction even when a read queues its first
// request synchronously. Model that narrow race once, then provide a healthy
// replacement connection for the retry.
class FirstReadFailsTransaction extends DyingTransaction {
  constructor(private readonly reportFailure?: (error: Error) => void) {
    super();
  }

  override objectStore(name: string) {
    const store = super.objectStore(name);
    return {
      ...store,
      index: (indexName: string) => {
        const index = store.index(indexName);
        return {
          ...index,
          getAll: (_value: string) => {
            const error = new Error('Attempt to get all index records from database without an in-progress transaction');
            error.name = 'UnknownError';
            this.reportFailure?.(error);
            throw error;
          },
        };
      },
    };
  }
}

class RetryReadFakeDB extends RaceFakeDB {
  onerror: ((event: { target: { error: Error } }) => void) | null = null;

  override transaction(_stores: unknown, _mode: unknown) {
    this.transactionCalls++;
    if (this.transactionCalls === 1) {
      return new FirstReadFailsTransaction((error) => this.onerror?.({ target: { error } }));
    }
    return new DyingTransaction();
  }
}

function stubIndexedDBWithRetryingReadDB(): RetryReadFakeDB {
  const db = new RetryReadFakeDB();
  vi.stubGlobal('indexedDB', {
    open() {
      const req: { onsuccess: (() => void) | null; onerror: (() => void) | null; result?: RetryReadFakeDB } = {
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  });
  return db;
}

class AlwaysFailingReadFakeDB extends RaceFakeDB {
  onerror: ((event: { target: { error: Error } }) => void) | null = null;

  override transaction(_stores: unknown, _mode: unknown) {
    this.transactionCalls++;
    return new FirstReadFailsTransaction((error) => this.onerror?.({ target: { error } }));
  }
}

function stubIndexedDBWithAlwaysFailingReadDB(): AlwaysFailingReadFakeDB {
  const db = new AlwaysFailingReadFakeDB();
  vi.stubGlobal('indexedDB', {
    open() {
      const req: { onsuccess: (() => void) | null; onerror: (() => void) | null; result?: AlwaysFailingReadFakeDB } = {
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  });
  return db;
}

beforeEach(() => {
  vi.resetModules();
  mocks.logError.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shot-storage.ts (v2) — transaction-lifecycle race', () => {
  it('getSyncMetadata places its request in the SAME tick the transaction is created — never throws "transaction has finished"', async () => {
    stubIndexedDBWithRaceFakeDB();
    const shotStorage = await import('../shot-storage');

    await expect(shotStorage.getSyncMetadata('lastSyncAttempt')).resolves.toBeNull();
  });

  it('getPendingShots survives the same race', async () => {
    stubIndexedDBWithRaceFakeDB();
    const shotStorage = await import('../shot-storage');

    await expect(shotStorage.getPendingShots()).resolves.toEqual([]);
  });

  it('retries a WebKit inactive-transaction read once without reporting a client error', async () => {
    const db = stubIndexedDBWithRetryingReadDB();
    const shotStorage = await import('../shot-storage');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(shotStorage.getPendingRounds()).resolves.toEqual([]);
      expect(db.transactionCalls).toBe(2);
      expect(mocks.logError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('degrades to server-backed recovery after an exhausted retry instead of re-reporting the same WebKit failure', async () => {
    const db = stubIndexedDBWithAlwaysFailingReadDB();
    const shotStorage = await import('../shot-storage');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(shotStorage.getPendingRounds()).rejects.toThrow(/without an in-progress transaction/);
      expect(db.transactionCalls).toBe(2);
      expect(shotStorage.isIdbUnavailableThisSession()).toBe(true);
      expect(mocks.logError).toHaveBeenCalledTimes(1);
      expect(mocks.logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ component: 'shot-storage' }),
        'low',
      );
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('indexed-db.ts (v1) — same transaction-lifecycle race', () => {
  it('getPendingRoundCount places its request in the SAME tick the transaction is created', async () => {
    stubIndexedDBWithRaceFakeDB();
    const v1 = await import('../indexed-db');

    await expect(v1.getPendingRoundCount()).resolves.toBe(0);
  });
});

describe('shot-storage.ts (v2) — device-level open failure degrades once, silently', () => {
  it('fails fast on the SECOND call instead of re-attempting indexedDB.open()', async () => {
    const counter = stubAlwaysFailingOpen();
    const shotStorage = await import('../shot-storage');

    await expect(shotStorage.getSyncMetadata('lastSyncAttempt')).rejects.toThrow(/Failed to open IndexedDB/);
    expect(counter.openCalls).toBe(1);

    await expect(shotStorage.getSyncMetadata('lastSuccessfulSync')).rejects.toThrow();
    // The fix under test: no second real indexedDB.open() attempt.
    expect(counter.openCalls).toBe(1);
  });

  it('logs the failure exactly once across many repeated calls (5 production events -> 1)', async () => {
    stubAlwaysFailingOpen();
    const shotStorage = await import('../shot-storage');

    for (let i = 0; i < 5; i++) {
      await expect(shotStorage.getSyncMetadata('k')).rejects.toThrow();
    }

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'shot-storage' }),
      'low',
    );
  });

  it('isIdbUnavailableThisSession() flips true after the first failure — the flag sync-engine.ts gates its own logs on', async () => {
    stubAlwaysFailingOpen();
    const shotStorage = await import('../shot-storage');

    expect(shotStorage.isIdbUnavailableThisSession()).toBe(false);
    await expect(shotStorage.getSyncMetadata('k')).rejects.toThrow();
    expect(shotStorage.isIdbUnavailableThisSession()).toBe(true);
  });

  it('isOfflineStorageAvailable() degrades to false without throwing, network-only behavior intact', async () => {
    stubAlwaysFailingOpen();
    const shotStorage = await import('../shot-storage');

    await expect(shotStorage.isOfflineStorageAvailable()).resolves.toBe(false);
    await expect(shotStorage.isOfflineStorageAvailable()).resolves.toBe(false);
  });
});

describe('indexed-db.ts (v1) — device-level open failure degrades once, silently', () => {
  it('fails fast on the SECOND call instead of re-attempting indexedDB.open()', async () => {
    const counter = stubAlwaysFailingOpen();
    const v1 = await import('../indexed-db');

    await expect(v1.getPendingRoundCount()).rejects.toThrow(/Failed to open IndexedDB/);
    expect(counter.openCalls).toBe(1);

    await expect(v1.getPendingRoundCount()).rejects.toThrow();
    expect(counter.openCalls).toBe(1);
  });

  it('logs the failure exactly once (dynamic import of error-logging.ts)', async () => {
    stubAlwaysFailingOpen();
    const v1 = await import('../indexed-db');

    for (let i = 0; i < 5; i++) {
      await expect(v1.getPendingRoundCount()).rejects.toThrow();
    }

    // The report is dispatched via a dynamic import — flush its microtask.
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'indexed-db' }),
      'low',
    );
  });

  it('isIndexedDBAvailable() degrades to false without throwing', async () => {
    stubAlwaysFailingOpen();
    const v1 = await import('../indexed-db');

    await expect(v1.isIndexedDBAvailable()).resolves.toBe(false);
    await expect(v1.isIndexedDBAvailable()).resolves.toBe(false);
  });
});
