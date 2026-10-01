import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/**
 * Swap audit F-14: the Clubhouse shell never started the offline sync engine
 * (only Fairway's OfflineProvider did), so a round queued offline synced only
 * while a round screen was open. OfflineSync starts it for the session.
 */

const engine = {
  setCallbacks: vi.fn(),
  initialize: vi.fn(async () => {}),
  syncAll: vi.fn(async () => ({ syncedRounds: 1, syncedHoles: 0, syncedShots: 0 })),
  stopAutoSync: vi.fn(),
};
vi.mock('@/lib/offline/sync-engine', () => ({ getSyncEngine: () => engine }));

const store = {
  markSyncStarted: vi.fn(),
  completeSync: vi.fn(),
  failSync: vi.fn(),
  setReady: vi.fn(),
  refreshPendingCounts: vi.fn(async () => {}),
};
vi.mock('@/stores/offline-sync-store', () => ({ useOfflineSyncStore: { getState: () => store } }));

import { OfflineSync } from '../shell/OfflineSync';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('Clubhouse OfflineSync', () => {
  it('starts the sync engine on mount and marks the store ready', async () => {
    render(<OfflineSync />);
    expect(engine.setCallbacks).toHaveBeenCalledTimes(1);
    expect(engine.initialize).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(store.setReady).toHaveBeenCalledWith(true));
    expect(store.refreshPendingCounts).toHaveBeenCalled();
  });

  it('reports a completed sync to the store', () => {
    render(<OfflineSync />);
    const callbacks = engine.setCallbacks.mock.calls[0]![0] as { onSyncComplete: (r: unknown) => void };
    callbacks.onSyncComplete({ syncedRounds: 1, syncedHoles: 0, syncedShots: 0 });
    expect(store.completeSync).toHaveBeenCalledWith(true);
  });

  it('syncs on a service worker request and stops auto sync on unmount', () => {
    const { unmount } = render(<OfflineSync />);
    window.dispatchEvent(new Event('sw-sync-requested'));
    expect(engine.syncAll).toHaveBeenCalledTimes(1);
    unmount();
    expect(engine.stopAutoSync).toHaveBeenCalledTimes(1);
  });
});
