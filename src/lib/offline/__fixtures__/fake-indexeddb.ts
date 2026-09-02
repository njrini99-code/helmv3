/**
 * Minimal in-memory IndexedDB fake for the offline-storage tests.
 *
 * jsdom has no IndexedDB. This supports exactly the operations the offline
 * modules use — add/put/get/delete/clear, plus index getAll/count/openCursor
 * keyed on a single value — and nothing more.
 *
 * Extracted from db-consolidation.test.ts so retry-failed.test.ts can drive the
 * REAL storage functions against it too. Test scaffolding only; never imported
 * by application code. Not named `*.test.ts`, so vitest does not collect it.
 */
import { vi } from 'vitest';

export type Row = Record<string, unknown>;

export function makeRequest<T>(getResult: () => T) {
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

export class FakeIndex {
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
    // Not exercised by the assertions; return an immediately-null cursor.
    return makeRequest(() => null);
  }
}

export class FakeObjectStore {
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
  getAll() {
    return makeRequest(() => [...this.rows.values()]);
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

export class FakeTransaction {
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

export class FakeDB {
  stores = new Map<string, FakeObjectStore>();
  transactionCalls = 0;
  failOnTransactionCall: number | null = null;
  objectStoreNames = {
    contains: (n: string) => this.stores.has(n),
    get length() {
      return 0;
    },
  };
  onversionchange: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
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
    this.transactionCalls++;
    if (this.transactionCalls === this.failOnTransactionCall) {
      const error = new Error('The database connection is closing');
      error.name = 'InvalidStateError';
      throw error;
    }
    return new FakeTransaction(this);
  }
  close() {}
}

export const databases = new Map<string, FakeDB>();

export function installFakeIndexedDB() {
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
