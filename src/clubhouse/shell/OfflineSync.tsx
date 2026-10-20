'use client';

import { useEffect } from 'react';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';
import { chReport } from '../lib/track';

/**
 * Starts the offline sync engine for the whole Clubhouse session, as the
 * Fairway shell's OfflineProvider does. Without it the engine ran only while a
 * round screen was open, so a round, hole or shot queued offline waited until
 * the player opened a round again. No UI: the store it feeds drives
 * Clubhouse's own offline banner and round screens.
 */
export function OfflineSync() {
  useEffect(() => {
    const engine = getSyncEngine();
    engine.setCallbacks({
      // Mirror the engine's state; calling startSync() here would re-enter the
      // engine's concurrency guard (see OfflineProvider).
      onSyncStart: () => useOfflineSyncStore.getState().markSyncStarted(),
      onSyncProgress: () => {},
      onSyncComplete: (result) => {
        useOfflineSyncStore.getState().completeSync(result.syncedRounds + result.syncedHoles + result.syncedShots > 0);
      },
      onSyncError: (error) => useOfflineSyncStore.getState().failSync(error.message),
      // A queued round, hole or shot that fails to sync used to leave no server signal, so a round stranded on a phone was
      // invisible (swap audit §18). Every failure is reported; the one that ends the retries is high severity.
      onItemFailed: (type, offlineId, error) => {
        const final = error === 'Max sync attempts reached';
        chReport(new Error(`Offline ${type} sync failed: ${error}`), {
          surface: 'offline-sync',
          action: final ? 'sync.gaveUp' : 'sync.itemFailed',
          severity: final ? 'high' : 'low',
          extra: { itemType: type, offlineId },
        });
      },
    });
    let cancelled = false;
    engine
      .initialize()
      .then(async () => {
        if (cancelled) return;
        useOfflineSyncStore.getState().setReady(true);
        await useOfflineSyncStore.getState().refreshPendingCounts();
      })
      .catch(() => {
        // The engine retries on the next reconnect; a round screen still syncs on its own.
      });
    const onSwSync = () => {
      engine.syncAll().catch(() => {});
    };
    window.addEventListener('sw-sync-requested', onSwSync);
    return () => {
      cancelled = true;
      window.removeEventListener('sw-sync-requested', onSwSync);
      engine.stopAutoSync();
    };
  }, []);
  return null;
}
