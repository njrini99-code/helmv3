import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const chReport = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport }));

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

  it('reports a failed item to Sentry, high once the engine gives up (swap audit §18)', () => {
    render(<OfflineSync />);
    const callbacks = engine.setCallbacks.mock.calls[0]![0] as { onItemFailed: (t: string, id: string, e: string) => void };
    callbacks.onItemFailed('hole', 'off-1', 'network down');
    callbacks.onItemFailed('round', 'off-2', 'Max sync attempts reached');
    expect(chReport).toHaveBeenNthCalledWith(1, expect.any(Error), expect.objectContaining({ surface: 'offline-sync', action: 'sync.itemFailed', severity: 'low', extra: { itemType: 'hole', offlineId: 'off-1' } }));
    expect(chReport).toHaveBeenNthCalledWith(2, expect.any(Error), expect.objectContaining({ action: 'sync.gaveUp', severity: 'high', extra: { itemType: 'round', offlineId: 'off-2' } }));
  });

  it('syncs on a service worker request and stops auto sync on unmount', () => {
    const { unmount } = render(<OfflineSync />);
    window.dispatchEvent(new Event('sw-sync-requested'));
    expect(engine.syncAll).toHaveBeenCalledTimes(1);
    unmount();
    expect(engine.stopAutoSync).toHaveBeenCalledTimes(1);
  });

  // Fairway retirement (2026-11-14): only Fairway's OfflineProvider registered public/sw.js, so a device that first
  // opened the app under Clubhouse had no offline page, no cached dashboard and no Background Sync wake-up. The
  // Clubhouse session now registers it and turns the worker's SYNC_REQUESTED message into a sync pass.
  describe('service worker', () => {
    const messageListeners: Array<(event: MessageEvent) => void> = [];
    const registration = { addEventListener: vi.fn() };
    const serviceWorker = {
      register: vi.fn(async () => registration),
      getRegistrations: vi.fn(async () => []),
      addEventListener: vi.fn((type: string, fn: (event: MessageEvent) => void) => {
        if (type === 'message') messageListeners.push(fn);
      }),
      removeEventListener: vi.fn(),
      controller: null,
    };

    beforeEach(() => {
      messageListeners.length = 0;
      // The hook registers in production builds only (a dev service worker keeps a cache that never invalidates).
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubGlobal('caches', { keys: vi.fn(async () => []), delete: vi.fn(async () => true) });
      Object.defineProperty(window.navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
    });

    afterEach(() => {
      cleanup();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(window.navigator, 'serviceWorker');
    });

    it('registers /sw.js for the whole site when the session starts', async () => {
      render(<OfflineSync />);
      await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' }));
    });

    it("runs a sync pass when the worker's Background Sync asks for one", async () => {
      render(<OfflineSync />);
      await vi.waitFor(() => expect(messageListeners.length).toBeGreaterThan(0));
      engine.syncAll.mockClear();
      for (const listener of messageListeners) listener(new MessageEvent('message', { data: { type: 'SYNC_REQUESTED', tag: 'sync-golf-data' } }));
      expect(engine.syncAll).toHaveBeenCalledTimes(1);
    });
  });
});
