/**
 * A sync declined because one is already running is NOT an error.
 *
 * Reproduced in production 2026-08-31 by opening a live round: a red toast sat
 * over the scorecard reading
 *
 *     Sync error
 *     Sync already in progress
 *
 * Nothing had failed. The concurrency guard was doing exactly its job — a
 * second sync arrived while one was in flight, and deferring to the running
 * one is correct. But the guard reported itself as `success: false` with an
 * error string, `offline-sync-store` copied that string into `syncError`, and
 * `OfflineIndicator` force-opens on `if (!isOnline || syncError)`. So the
 * player was told their round was failing to save while it was, in fact,
 * being saved by the very run that caused the decline.
 *
 * `success: false` could not carry the difference between "we tried and it
 * broke" and "we did not need to try". `declined` does, and `errors` is empty
 * so no surface can render a decline as a failure even if it ignores the flag.
 */
import { describe, it, expect } from 'vitest';
import { getSyncEngine } from '../sync-engine';

describe('SyncEngine — a declined run is not a failure', () => {
  it('returns declined with NO errors when a sync is already in flight', async () => {
    // `SyncEngine` itself is not exported — a comment at the bottom of that
    // file claims it is, and it is not. The factory is the only door.
    const engine = getSyncEngine();
    // The exact condition the guard exists for.
    (engine as unknown as { isSyncingFlag: boolean }).isSyncingFlag = true;

    const result = await engine.syncPendingData();

    expect(result.declined).toBe('already-running');
    // The assertion that carries this file. An empty `errors` is what stops
    // every downstream surface — store, indicator, history — from rendering
    // the concurrency guard as a problem the player must act on.
    expect(result.errors).toEqual([]);
    expect(result.failedItems).toBe(0);
  });
});
