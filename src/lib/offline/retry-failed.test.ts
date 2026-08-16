/**
 * Regression test for `SyncEngine.retryFailed()`.
 *
 * BUG (this file was written to prove it, before any fix):
 *   retryFailed() is the only path that can resurrect an offline item whose
 *   sync failed. It reads candidates with getPendingRounds/Holes/Shots — each
 *   of which queries `index.getAll('pending')`, so every row it returns has
 *   `_sync_status === 'pending'` BY CONSTRUCTION — and then filters:
 *
 *       if (round._sync_status === 'failed' && shouldRetry(...))
 *
 *   That predicate can never be true. The loop body never runs, so nothing is
 *   ever reset to 'pending'.
 *
 * WHY IT MATTERS: markRoundFailed sets `_sync_status = 'failed'`, and the
 * pending queries exclude 'failed'. So after ONE failed sync attempt a round is
 * invisible to both the normal sync path and to retryFailed — permanently
 * stranded in IndexedDB. The player's "Retry sync" control
 * (continue-round-client.tsx wires onRetrySync -> retryFailedSync) is a no-op,
 * and the round data is never recoverable.
 *
 * The v1 legacy path already guards this (sync-engine.ts marks an exhausted v1
 * round 'failed' explicitly "rather than leaving it stuck pending forever").
 * The v2 path had no equivalent, and no test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installFakeIndexedDB,
  databases,
  type Row,
} from './__fixtures__/fake-indexeddb';

const V2_DB = 'golfhelm_offline_v2';
const ROUNDS = 'offline_rounds';
const SHOTS = 'offline_shots';

/** A round that failed to sync once, with its backoff window already elapsed. */
function strandedRound(id: string): Row {
  return {
    _offline_id: id,
    _sync_status: 'failed',
    _retry_count: 1,
    // Well past the 2s backoff for retry #1, so shouldRetry() is not the blocker.
    _last_retry: new Date(Date.now() - 10 * 60_000).toISOString(),
    _created_offline: new Date(Date.now() - 20 * 60_000).toISOString(),
    _error_message: 'server boom',
    player_id: '11111111-1111-1111-1111-111111111111',
  };
}

async function seedStrandedRound(id: string) {
  const storage = await import('./shot-storage');
  // Touch the store so the fake DB is created with its object stores.
  await storage.getPendingRounds();
  const db = databases.get(V2_DB)!;
  db.stores.get(ROUNDS)!.rows.set(id, strandedRound(id));
  return db;
}

describe('SyncEngine.retryFailed — failed offline rounds must be recoverable', () => {
  beforeEach(() => {
    databases.clear();
    vi.resetModules();
    installFakeIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- Control: establishes the mechanism, so the failure below is unambiguous.
  it('getPendingRounds excludes a failed round (control for the bug below)', async () => {
    const db = await seedStrandedRound('round-stranded');
    db.stores.get(ROUNDS)!.rows.set('round-ok', {
      _offline_id: 'round-ok',
      _sync_status: 'pending',
      _retry_count: 0,
      _created_offline: new Date().toISOString(),
    });

    const storage = await import('./shot-storage');
    const pending = await storage.getPendingRounds();

    // The pending query returns ONLY 'pending' rows — this is why retryFailed's
    // `=== 'failed'` filter can never match anything it was handed.
    expect(pending.map((r) => r._offline_id)).toEqual(['round-ok']);
  });

  it('requeues a failed round so it becomes syncable again', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'server-1', lastAutoSave: '2026-08-16T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const db = await seedStrandedRound('round-stranded');

    const { getSyncEngine } = await import('./sync-engine');
    await getSyncEngine().retryFailed();

    const row = db.stores.get(ROUNDS)!.rows.get('round-stranded') as Row;
    expect(row).toBeTruthy();
    // It must no longer be stuck in 'failed' — retryFailed's whole job is to
    // move it back into the queue.
    expect(row._sync_status).not.toBe('failed');

    // ...and requeued is not the same as recovered. Assert it actually reached
    // the server in the SAME call: retryFailed ends with syncPendingData(), and
    // that pass skips anything still inside its backoff window. Without this,
    // a round that flipped to 'pending' and then sat there would pass the
    // assertion above while the player's data was still stranded.
    expect(saveRoundDraft).toHaveBeenCalledTimes(1);
    expect(row._sync_status).toBe('synced');
  });

  it('requeues a failed SHOT (the highest-volume offline entity)', async () => {
    const storage = await import('./shot-storage');
    await storage.getPendingShots();
    const db = databases.get(V2_DB)!;
    db.stores.get(SHOTS)!.rows.set('shot-stranded', {
      _offline_id: 'shot-stranded',
      _sync_status: 'failed',
      _retry_count: 1,
      _last_retry: new Date(Date.now() - 10 * 60_000).toISOString(),
      _created_offline: new Date(Date.now() - 20 * 60_000).toISOString(),
      round_offline_id: 'round-1',
    });

    const { getSyncEngine } = await import('./sync-engine');
    await getSyncEngine().retryFailed();

    const row = db.stores.get(SHOTS)!.rows.get('shot-stranded') as Row;
    expect(row).toBeTruthy();
    expect(row._sync_status).not.toBe('failed');
  });

  // Reachability: retryFailed() being correct is worthless if nothing calls it.
  // The only UI affordance (OfflineIndicator's retry button) renders solely when
  // `syncError` is set — React state, gone on remount — and the indicator itself
  // is gated on `pendingCount`, which reads the v1 sync queue and so never counts
  // a v2 failed round. `offlineSyncStore.failedCount` does count them but is read
  // by nothing. So a round that failed in a PREVIOUS session must be recovered by
  // the ordinary reconnect path or not at all.
  it('recovers a failed round through the ordinary sync path, not just an explicit retry', async () => {
    const saveRoundDraft = vi.fn(async () => ({
      success: true as const,
      data: { roundId: 'server-2', lastAutoSave: '2026-08-16T00:00:00.000Z' },
    }));
    vi.doMock('@/app/golf/actions/round-drafts', () => ({ saveRoundDraft }));

    const db = await seedStrandedRound('round-reconnect');

    const { getSyncEngine } = await import('./sync-engine');
    // syncAll() is what auto-sync/reconnect runs — NOT retryFailed().
    await getSyncEngine().syncAll();

    const row = db.stores.get(ROUNDS)!.rows.get('round-reconnect') as Row;
    expect(row._sync_status).not.toBe('failed');
  });

  it('leaves a round alone once its retry budget is exhausted', async () => {
    const db = await seedStrandedRound('round-exhausted');
    const store = db.stores.get(ROUNDS)!;
    const row = store.rows.get('round-exhausted') as Row;
    row._retry_count = 10; // MAX_RETRY_COUNT
    store.rows.set('round-exhausted', row);

    const { getSyncEngine } = await import('./sync-engine');
    await getSyncEngine().retryFailed();

    // Budget exhausted → stays failed. This guards the fix from over-reaching
    // into an infinite retry loop.
    const after = store.rows.get('round-exhausted') as Row;
    expect(after._sync_status).toBe('failed');
  });
});
