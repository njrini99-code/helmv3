/**
 * Regression test for the Live Weight Room offline set buffer.
 *
 * Defect: LiveWeightRoom's optimistic set log rolled the set OUT of local state
 * the instant the server action rejected — and a flaky weight-room network IS a
 * rejection, so a logged set was silently lost (the GolfHelm round-resume
 * incident, but for lifting). This buffer durably captures each set so it
 * survives a dropped connection / tab close and replays on reconnect.
 *
 * These tests prove the load-bearing invariants:
 *   1. enqueue persists durably and is readable back.
 *   2. enqueue is idempotent on (sessionExerciseId, setNumber) — a correction
 *      REPLACES rather than duplicating (matches the server upsert key).
 *   3. a failed flush is NON-DESTRUCTIVE — recordSetFailure keeps the entry and
 *      only bumps backoff; only removeSet (confirmed success) drops it.
 *   4. backoff (shouldRetrySet) gates re-attempts and gives up after the budget.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom in this workspace does not expose window.localStorage, so we install a
// minimal in-memory Storage. The buffer itself is SSR/quota-safe (every access
// is guarded), so this only gives the test a real persistence surface to assert.
function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  vi.stubGlobal('localStorage', mock);
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true });
}

import {
  enqueueSet,
  readPendingSets,
  removeSet,
  recordSetFailure,
  shouldRetrySet,
  pendingSetCount,
  MAX_SET_RETRY_COUNT,
  type BufferedLiveSet,
} from '../live-set-offline-buffer';

const base = {
  sessionId: '11111111-1111-1111-1111-111111111111',
  sessionExerciseId: '22222222-2222-2222-2222-222222222222',
  setNumber: 1,
  actualReps: 5,
  actualLoad: 225,
  loadUnit: 'lb',
  rpe: 8,
};

beforeEach(() => {
  installMemoryStorage();
  window.localStorage.clear();
});

describe('live-set-offline-buffer', () => {
  it('persists an enqueued set durably and reads it back', () => {
    const entry = enqueueSet(base);
    expect(entry.id).toBeTruthy();
    expect(entry.retryCount).toBe(0);
    const all = readPendingSets();
    expect(all).toHaveLength(1);
    expect(all[0]!.actualLoad).toBe(225);
    expect(pendingSetCount()).toBe(1);
  });

  it('is idempotent on (sessionExerciseId, setNumber) — a correction replaces, never duplicates', () => {
    const first = enqueueSet(base);
    const corrected = enqueueSet({ ...base, actualLoad: 235 });
    expect(readPendingSets()).toHaveLength(1);
    expect(corrected.id).toBe(first.id); // same logical set keeps its id
    expect(readPendingSets()[0]!.actualLoad).toBe(235);
  });

  it('keeps distinct set numbers as separate entries', () => {
    enqueueSet(base);
    enqueueSet({ ...base, setNumber: 2 });
    expect(readPendingSets()).toHaveLength(2);
  });

  it('recordSetFailure is non-destructive: bumps backoff, keeps the entry', () => {
    const entry = enqueueSet(base);
    recordSetFailure(entry.id);
    const after = readPendingSets();
    expect(after).toHaveLength(1); // NOT dropped on failure
    expect(after[0]!.retryCount).toBe(1);
    expect(after[0]!.lastAttemptAt).toBeTruthy();
  });

  it('removeSet drops only the confirmed entry', () => {
    const a = enqueueSet(base);
    enqueueSet({ ...base, setNumber: 2 });
    removeSet(a.id);
    const after = readPendingSets();
    expect(after).toHaveLength(1);
    expect(after[0]!.setNumber).toBe(2);
  });

  it('shouldRetrySet allows the first attempt and respects backoff thereafter', () => {
    const fresh: BufferedLiveSet = { ...base, id: 'x', queuedAt: Date.now(), retryCount: 0, lastAttemptAt: null };
    expect(shouldRetrySet(fresh)).toBe(true);

    const now = Date.now();
    const justFailed: BufferedLiveSet = { ...fresh, retryCount: 1, lastAttemptAt: new Date(now).toISOString() };
    expect(shouldRetrySet(justFailed, now + 500)).toBe(false); // inside 2s window
    expect(shouldRetrySet(justFailed, now + 2500)).toBe(true); // window elapsed
  });

  it('gives up after the retry budget is exhausted', () => {
    const spent: BufferedLiveSet = {
      ...base,
      id: 'x',
      queuedAt: Date.now(),
      retryCount: MAX_SET_RETRY_COUNT,
      lastAttemptAt: new Date(0).toISOString(),
    };
    expect(shouldRetrySet(spent)).toBe(false);
  });

  it('tolerates a corrupt storage key without throwing', () => {
    window.localStorage.setItem('baseball.liveWeightRoom.pendingSets.v1', '{not json');
    expect(readPendingSets()).toEqual([]);
    expect(pendingSetCount()).toBe(0);
  });
});
