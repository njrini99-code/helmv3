/**
 * A sync-start callback mirrors the engine's state. It must never start a sync.
 *
 * Reproduced against production 2026-08-31: a player saved a shot successfully
 * (the flight recorder confirmed holes 18/18 and shots 1/1 written), exited,
 * and resumed the round — and got "0/18", "Sync error", "Sync already in
 * progress" over the scorecard. Nothing had failed.
 *
 * The mechanism is an ordering detail worth stating exactly, because it is why
 * the store's own guard did not catch this:
 *
 *   1. syncPendingData() sets `isSyncingFlag = true`.
 *   2. ...then fires notifyCallbacks('onSyncStart').
 *   3. notifyCallbacks runs the CONFIG callback first (setCallbacks, which is
 *      what OfflineProvider used) and only then the REGISTERED ones
 *      (registerCallback, which is what the store itself uses).
 *   4. So the provider's handler ran while the store's `isSyncing` was still
 *      false — sailing straight past `if (state.isSyncing) return null` — and
 *      called engine.syncNow().
 *   5. That re-entered syncPendingData(), tripped the flag from step 1, and
 *      came back declined. The store rendered the decline as `syncError`, and
 *      OfflineIndicator force-opens on `if (!isOnline || syncError)`.
 *
 * `sync-engine-decline.test.ts` covers the other half: that a decline carries
 * no `errors` so no surface can paint it as a failure. This file covers the
 * cause — the second run is never started in the first place.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useOfflineSyncStore } from '../offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';

describe('onSyncStart — mirror state, never re-enter the engine', () => {
  beforeEach(() => {
    useOfflineSyncStore.setState({
      isSyncing: false,
      isOnline: true,
      syncStatus: 'idle',
      syncError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (getSyncEngine() as unknown as { isSyncingFlag: boolean }).isSyncingFlag = false;
  });

  it('markSyncStarted reflects the running sync without launching another', () => {
    const engine = getSyncEngine();
    const spy = vi.spyOn(engine, 'syncPendingData');

    useOfflineSyncStore.getState().markSyncStarted();

    const s = useOfflineSyncStore.getState();
    expect(s.isSyncing).toBe(true);
    expect(s.syncStatus).toBe('syncing');
    expect(s.syncError).toBeNull();
    // The assertion this file exists for.
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not re-enter under the exact production ordering', async () => {
    const engine = getSyncEngine();
    // Step 1: the engine has already marked itself running...
    (engine as unknown as { isSyncingFlag: boolean }).isSyncingFlag = true;
    // ...and the store has NOT yet been told, because the config callback runs
    // first. This is the window the old code fell through.
    expect(useOfflineSyncStore.getState().isSyncing).toBe(false);

    const spy = vi.spyOn(engine, 'syncPendingData');

    // What OfflineProvider's onSyncStart now does.
    useOfflineSyncStore.getState().markSyncStarted();
    await Promise.resolve();

    expect(spy).not.toHaveBeenCalled();
    const s = useOfflineSyncStore.getState();
    expect(s.syncError).toBeNull();
    expect(s.syncStatus).not.toBe('error');
  });
});
