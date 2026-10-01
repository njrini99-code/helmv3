'use client';

import { useEffect } from 'react';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';

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
