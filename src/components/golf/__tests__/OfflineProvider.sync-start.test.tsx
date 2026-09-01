/**
 * OfflineProvider's onSyncStart must mirror state, not start a second sync.
 *
 * The companion unit test (src/stores/__tests__/offline-sync-start-callback.test.ts)
 * pins the store action's contract. This one pins THE WIRING — it fails if
 * anyone points OfflineProvider's callback back at startSync(), which is the
 * revert that would reintroduce the production defect of 2026-08-31:
 * a saved round resuming with "Sync error / Sync already in progress" over
 * the scorecard while the data was, in fact, already written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { SyncCallback } from '@/lib/offline/sync-engine';

const engine = {
  setCallbacks: vi.fn(),
  initialize: vi.fn().mockResolvedValue(undefined),
  stopAutoSync: vi.fn(),
  syncAll: vi.fn().mockResolvedValue({ success: true }),
  syncPendingData: vi.fn().mockResolvedValue({ success: true }),
  // The door store.startSync() actually uses. Present so that a revert fails
  // on the re-entrancy assertion below rather than on a missing method.
  syncNow: vi.fn().mockResolvedValue({
    success: true, syncedRounds: 0, syncedHoles: 0, syncedShots: 0,
    failedItems: 0, errors: [],
  }),
  retryFailed: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/lib/offline/sync-engine', () => ({
  getSyncEngine: () => engine,
}));
vi.mock('@/hooks/golf/use-connection-status', () => ({
  useConnectionStatus: () => ({ isOnline: true, isSlowConnection: false, effectiveType: '4g' }),
}));
vi.mock('@/hooks/golf/use-service-worker', () => ({ useServiceWorker: () => ({}) }));
vi.mock('../OfflineSyncStatus', () => ({ OfflineSyncStatus: () => null }));
vi.mock('../OfflineWarningBanner', () => ({ OfflineWarningBanner: () => null }));

import { OfflineProvider } from '../OfflineProvider';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';

describe('OfflineProvider — onSyncStart does not re-enter the engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineSyncStore.setState({
      isSyncing: false,
      isOnline: true,
      syncStatus: 'idle',
      syncError: null,
      refreshPendingCounts: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('mirrors the engine-started sync without launching another', async () => {
    render(<OfflineProvider>{null}</OfflineProvider>);

    await waitFor(() => expect(engine.setCallbacks).toHaveBeenCalled());
    const callbacks = engine.setCallbacks.mock.calls[0]?.[0] as SyncCallback;

    // The engine is already running when it fires this — that is the whole point.
    callbacks.onSyncStart?.();
    await Promise.resolve();

    // The regression assertion: no second run, by any door.
    expect(engine.syncNow).not.toHaveBeenCalled();
    expect(engine.syncPendingData).not.toHaveBeenCalled();
    expect(engine.syncAll).not.toHaveBeenCalled();

    const s = useOfflineSyncStore.getState();
    expect(s.isSyncing).toBe(true);
    expect(s.syncStatus).toBe('syncing');
    expect(s.syncError).toBeNull();
  });
});
