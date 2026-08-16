/**
 * Regression test for the v1 offline DB's failed-round recovery.
 *
 * THE TWIN BUG. `SyncEngine.retryFailed()` (v2, shot-storage.ts) had a dead
 * predicate: it read candidates from a query constrained to 'pending' and then
 * filtered for `_sync_status === 'failed'`, so nothing was ever requeued. That
 * was fixed in #1464.
 *
 * The v1 path has the SAME bug, unfixed. `useOfflineSync.retryFailedSync`
 * (src/hooks/golf/use-offline-sync.ts) does:
 *
 *     const pendingRounds = await getPendingRounds();      // index.getAll('pending')
 *     for (const round of pendingRounds) {
 *       if (round.syncStatus === 'failed' && ...) {        // can never be true
 *
 * `getPendingRounds`/`getPendingShots` (indexed-db.ts:400, :258) query
 * `index.getAll('pending')`, so every row they return is 'pending' by
 * construction and the `=== 'failed'` test never matches.
 *
 * WHY IT STRANDS A ROUND: the first sync failure sets syncStatus 'failed'
 * (use-offline-sync.ts), and the 'pending' queries then exclude it. v1 had NO
 * failed-side reader at all, so no code path anywhere could return the round to
 * 'pending' — not the hook's Retry button, not the global sync engine (its
 * requeueRetryableFailures only reads the v2 store), and not the manual
 * "Recover Round" page (also a 'pending'-only read). The player's completed
 * round sits in IndexedDB, unreachable, with a Retry button that does nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installFakeIndexedDB,
  databases,
  type Row,
} from './__fixtures__/fake-indexeddb';

const V1_DB = 'golfhelm_offline';
const ROUNDS = 'offline_rounds';
const SHOTS = 'offline_shots';

function failedRound(id: string): Row {
  return {
    id,
    syncStatus: 'failed',
    syncAttempts: 1,
    timestamp: Date.now() - 10 * 60_000,
    error: 'server boom',
    draftData: { step: 'tracking', setupData: { courseName: 'Pebble' } },
  };
}

/** Opens the v1 DB through the real module so its stores/indexes are created. */
async function seedFailedRound(id: string) {
  const v1 = await import('./indexed-db');
  await v1.getPendingRounds();
  const db = databases.get(V1_DB)!;
  db.stores.get(ROUNDS)!.rows.set(id, failedRound(id));
  return db;
}

describe('v1 offline DB — a failed round must stay recoverable', () => {
  beforeEach(() => {
    databases.clear();
    vi.resetModules();
    installFakeIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Control: demonstrates the mechanism rather than asserting it, so the
  // failure below is unambiguous.
  it('getPendingRounds excludes a failed round (control)', async () => {
    const db = await seedFailedRound('v1-stranded');
    db.stores.get(ROUNDS)!.rows.set('v1-ok', {
      id: 'v1-ok',
      syncStatus: 'pending',
      syncAttempts: 0,
      timestamp: Date.now(),
    });

    const v1 = await import('./indexed-db');
    const pending = await v1.getPendingRounds();

    expect(pending.map((r) => r.id)).toEqual(['v1-ok']);
  });

  it('exposes a way to read back FAILED rounds', async () => {
    const db = await seedFailedRound('v1-stranded');
    db.stores.get(ROUNDS)!.rows.set('v1-ok', {
      id: 'v1-ok',
      syncStatus: 'pending',
      syncAttempts: 0,
      timestamp: Date.now(),
    });

    const v1 = await import('./indexed-db');
    const failed = await v1.getFailedRounds();

    // Without this reader the hook's Retry button is provably a no-op: the only
    // list it can obtain contains no failed rows at all.
    expect(failed.map((r) => r.id)).toEqual(['v1-stranded']);
  });

  it('exposes a way to read back FAILED shots', async () => {
    const v1 = await import('./indexed-db');
    await v1.getPendingShots();
    const db = databases.get(V1_DB)!;
    db.stores.get(SHOTS)!.rows.set('shot-stranded', {
      id: 'shot-stranded',
      syncStatus: 'failed',
      syncAttempts: 1,
      timestamp: Date.now() - 60_000,
    });

    const failed = await v1.getFailedShots();
    expect(failed.map((s) => s.id)).toEqual(['shot-stranded']);
  });
});
