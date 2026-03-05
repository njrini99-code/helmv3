'use client';

/**
 * Shot Tracking with Offline Support Wrapper
 *
 * Wraps the ShotTrackingComprehensive component with offline sync capabilities.
 * Integrates with the new offline system including IndexedDB storage, sync engine,
 * and connection monitoring.
 *
 * Features:
 * - IndexedDB persistence for shots, holes, and rounds
 * - Automatic background sync with exponential backoff
 * - Visual indicators for sync status
 * - Offline warning banner
 * - Service worker integration
 */

import { useEffect, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useOfflineSyncStore, useOfflineSyncStatus, useOfflineSyncActions } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { saveOfflineShot, saveOfflineHole, saveOfflineRound } from '@/lib/offline/shot-storage';
// OfflineSyncStatus removed — was popping up during normal online use
import { OfflineWarningBanner } from './OfflineWarningBanner';
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';

// Dynamically import the main component to avoid SSR issues with IndexedDB
const ShotTrackingComprehensive = dynamic(
  () => import('./ShotTrackingComprehensive'),
  { ssr: false }
);

// ============================================================================
// TYPES
// ============================================================================

type Hole = RoundHole;

interface ShotTrackingWithOfflineProps {
  holes: Hole[];
  currentHoleIndex: number;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  onSaveShot?: (shot: ShotRecord) => void;
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
  initialShots?: ShotRecord[];
  initialShotNumber?: number;
  // Required for offline support
  roundId: string;
  playerId: string;
  // Optional draft data for offline persistence
  draftData?: Record<string, unknown>;
  // Auto-save props (will be enhanced with offline support)
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  autoSaveInterval?: number;
  // Offline-specific callbacks
  onOfflineStatusChange?: (isOnline: boolean) => void;
  onSyncComplete?: (success: boolean, syncedCount: number) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShotTrackingWithOffline({
  holes,
  currentHoleIndex,
  onHoleComplete,
  onHoleStatsUpdate,
  onSaveShot,
  onExit,
  onNavigateToHole,
  initialShots = [],
  initialShotNumber = 1,
  roundId,
  playerId,
  draftData,
  onAutoSave,
  autoSaveInterval = 30000,
  onOfflineStatusChange,
  onSyncComplete,
}: ShotTrackingWithOfflineProps) {
  // Connection status from new hook
  const connectionStatus = useConnectionStatus();

  // Zustand store for sync status
  const syncStatus = useOfflineSyncStatus();
  const syncActions = useOfflineSyncActions();

  // Track if we've shown the offline banner
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize sync engine and store
  useEffect(() => {
    const initialize = async () => {
      try {
        const syncEngine = getSyncEngine();

        // Set up callbacks
        syncEngine.setCallbacks({
          onSyncStart: () => {
            useOfflineSyncStore.getState().startSync();
          },
          onSyncComplete: (result) => {
            const syncedCount = result.syncedRounds + result.syncedHoles + result.syncedShots;
            useOfflineSyncStore.getState().completeSync(syncedCount > 0);
            onSyncComplete?.(syncedCount > 0, syncedCount);
          },
          onSyncError: (error) => {
            useOfflineSyncStore.getState().failSync(error.message);
          },
        });

        await syncEngine.initialize();
        useOfflineSyncStore.getState().setReady(true);
        await syncActions.refreshPendingCounts();
        setIsInitialized(true);
      } catch (error) {
        console.error('[ShotTrackingWithOffline] Failed to initialize:', error);
        setIsInitialized(true); // Still allow component to render
      }
    };

    initialize();

    return () => {
      const syncEngine = getSyncEngine();
      syncEngine.stopAutoSync();
    };
  }, [syncActions, onSyncComplete]);

  // Update connection status in store
  useEffect(() => {
    const store = useOfflineSyncStore.getState();
    store.setConnectionStatus(connectionStatus.isOnline, connectionStatus.quality);
    onOfflineStatusChange?.(connectionStatus.isOnline);
  }, [connectionStatus.isOnline, connectionStatus.quality, onOfflineStatusChange]);

  // Update banner visibility based on online status
  useEffect(() => {
    if (!connectionStatus.isOnline) {
      setShowOfflineBanner(true);
    } else if (syncStatus.pendingCount.total === 0 && !syncStatus.syncError) {
      // Hide banner after successful sync when back online
      const timer = setTimeout(() => {
        setShowOfflineBanner(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [connectionStatus.isOnline, syncStatus.pendingCount.total, syncStatus.syncError]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (connectionStatus.isOnline && syncStatus.pendingCount.total > 0 && isInitialized) {
      const timeout = setTimeout(async () => {
        try {
          const syncEngine = getSyncEngine();
          await syncEngine.syncAll();
        } catch (error) {
          console.error('[ShotTrackingWithOffline] Auto-sync failed:', error);
        }
      }, 2000);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [connectionStatus.isOnline, syncStatus.pendingCount.total, isInitialized]);

  /**
   * Enhanced auto-save that persists to IndexedDB
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    const currentHole = holes[holeIndex];
    if (!currentHole) return;

    // Save shots to IndexedDB
    for (const shot of shots) {
      try {
        // Map ShotRecord fields to OfflineShot interface
        // Note: roundId is used as round_offline_id for tracking purposes
        const offlineShotData = {
          round_offline_id: roundId,
          hole_number: currentHole.number,
          shot_number: shot.shotNumber,
          shot_type: shot.shotType || 'approach',
          club_type: shot.clubType || 'non_driver',
          result: shot.result || 'fairway',
          distance_to_hole_before: shot.distanceToHoleBefore || null,
          distance_to_hole_after: shot.distanceToHoleAfter || null,
          shot_distance: shot.shotDistance || null,
          is_penalty: shot.isPenalty || false,
          penalty_type: shot.penaltyType || null,
          miss_direction: shot.missDirection || null,
          lie_before: shot.lieBefore || null,
          distance_unit_before: shot.distanceUnitBefore || null,
          distance_unit_after: shot.distanceUnitAfter || null,
        };

        await saveOfflineShot(offlineShotData);
      } catch (error) {
        console.error('[ShotTrackingWithOffline] Failed to save shot to IndexedDB:', error);
      }
    }

    // Save round draft data
    if (draftData) {
      try {
        await saveOfflineRound({
          player_id: playerId,
          course_name: (draftData.courseName as string | undefined) ?? 'Unknown Course',
          round_date: new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10),
          round_type: (draftData.roundType as string | undefined) ?? 'practice',
          status: 'in_progress',
          holes_to_play: 18,
          total_score: null,
          total_putts: null,
          fairways_hit: null,
          greens_in_regulation: null,
          draft_data: {
            ...draftData,
            currentHoleIndex: holeIndex,
            inProgressShots: { [holeIndex]: shots },
          },
        });
      } catch (error) {
        console.error('[ShotTrackingWithOffline] Failed to save round draft:', error);
      }
    }

    // Refresh pending counts
    await syncActions.refreshPendingCounts();

    // If online, also call the original auto-save
    if (connectionStatus.isOnline && onAutoSave) {
      try {
        await onAutoSave(shots, holeIndex);
      } catch (error) {
        console.error('[ShotTrackingWithOffline] Server auto-save failed:', error);
        // Data is preserved in IndexedDB, will sync later
      }
    }
  }, [
    connectionStatus.isOnline,
    onAutoSave,
    roundId,
    playerId,
    draftData,
    holes,
    syncActions,
  ]);

  /**
   * Enhanced shot save that queues for offline sync
   */
  const handleSaveShot = useCallback(async (shot: ShotRecord) => {
    const currentHole = holes[currentHoleIndex];
    if (!currentHole) return;

    // Save shot to IndexedDB
    try {
      // Map ShotRecord fields to OfflineShot interface
      const offlineShotData = {
        round_offline_id: roundId,
        hole_number: currentHole.number,
        shot_number: shot.shotNumber,
        shot_type: shot.shotType || 'approach',
        club_type: shot.clubType || 'non_driver',
        result: shot.result || 'fairway',
        distance_to_hole_before: shot.distanceToHoleBefore || null,
        distance_to_hole_after: shot.distanceToHoleAfter || null,
        shot_distance: shot.shotDistance || null,
        is_penalty: shot.isPenalty || false,
        penalty_type: shot.penaltyType || null,
        miss_direction: shot.missDirection || null,
        lie_before: shot.lieBefore || null,
        distance_unit_before: shot.distanceUnitBefore || null,
        distance_unit_after: shot.distanceUnitAfter || null,
      };

      await saveOfflineShot(offlineShotData);
      await syncActions.refreshPendingCounts();
    } catch (error) {
      console.error('[ShotTrackingWithOffline] Failed to queue shot:', error);
    }

    // Call original save if provided
    if (onSaveShot) {
      onSaveShot(shot);
    }
  }, [roundId, holes, currentHoleIndex, onSaveShot, syncActions]);

  /**
   * Handle hole completion with offline storage
   */
  const handleHoleComplete = useCallback(async (holeIndex: number, stats: HoleStats) => {
    const currentHole = holes[holeIndex];
    if (!currentHole) {
      onHoleComplete(holeIndex, stats);
      return;
    }

    // Save hole data to IndexedDB
    try {
      // Map HoleStats to OfflineHole interface
      const offlineHoleData = {
        round_offline_id: roundId,
        hole_number: stats.holeNumber,
        par: stats.par,
        yardage: stats.yardage || null,
        score: stats.score || null,
        putts: stats.putts || null,
        fairway_hit: stats.fairwayHit,
        green_in_regulation: stats.greenInRegulation,
        driving_distance: stats.drivingDistance || null,
        approach_proximity: stats.approachProximity || null,
        first_putt_distance: stats.firstPuttDistance || null,
        scramble_attempt: stats.scrambleAttempt || false,
        scramble_made: stats.scrambleMade || false,
        sand_save_attempt: stats.sandSaveAttempt || false,
        sand_save_made: stats.sandSaveMade || false,
      };

      await saveOfflineHole(offlineHoleData);
      await syncActions.refreshPendingCounts();
    } catch (error) {
      console.error('[ShotTrackingWithOffline] Failed to save hole:', error);
    }

    // Call original handler
    onHoleComplete(holeIndex, stats);
  }, [roundId, holes, onHoleComplete, syncActions]);

  /**
   * Enhanced exit handler that ensures data is synced
   */
  const handleExit = useCallback(async () => {
    // Trigger immediate sync before exiting
    if (connectionStatus.isOnline && syncStatus.pendingCount.total > 0) {
      try {
        const syncEngine = getSyncEngine();
        await syncEngine.syncAll();
      } catch (error) {
        console.error('[ShotTrackingWithOffline] Exit sync failed:', error);
      }
    }

    if (onExit) {
      onExit();
    }
  }, [connectionStatus.isOnline, syncStatus.pendingCount.total, onExit]);

  // NOTE: handleSyncNow and handleRetryFailed were removed because the
  // OfflineSyncStatus floating UI that used them was removed to avoid
  // popping up during normal online use. If re-enabled, restore these handlers.

  return (
    <div className="relative">
      {/* Offline Warning Banner */}
      {showOfflineBanner && (
        <OfflineWarningBanner
          variant="floating"
          showForSlowConnection={true}
          dismissable={true}
          onDismiss={() => setShowOfflineBanner(false)}
          context="tracking your round"
        />
      )}

      {/* Main Shot Tracking Component */}
      <ShotTrackingComprehensive
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        onHoleComplete={handleHoleComplete}
        onHoleStatsUpdate={onHoleStatsUpdate}
        onSaveShot={handleSaveShot}
        onExit={handleExit}
        onNavigateToHole={onNavigateToHole}
        initialShots={initialShots}
        initialShotNumber={initialShotNumber}
        onAutoSave={handleAutoSave}
        autoSaveInterval={autoSaveInterval}
      />

      {/* Floating Sync Status removed — was popping up during normal online use */}
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ShotTrackingWithOfflineProps };
