'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats, type ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound } from '@/app/golf/actions/golf';
import { deleteOfflineRound } from '@/lib/offline/indexed-db';

import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import { useOfflineSync } from '@/hooks/golf/use-offline-sync';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { useToast } from '@/components/ui/toast';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

interface RoundSetupData {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  qualifierRoundNumber?: number;
}


interface ContinueRoundClientProps {
  roundId: string;
  setupData: RoundSetupData;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  startHoleIndex: number;
  initialShots?: HoleStats['shots'];
  initialShotNumber?: number;
}

export default function ContinueRoundClient({
  roundId,
  setupData,
  holes: initialHoles,
  completedHoleStats: initialCompletedStats,
  startHoleIndex,
  initialShots = [],
  initialShotNumber = 1,
}: ContinueRoundClientProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // IndexedDB-based offline sync for shot-level persistence
  const [offlineSyncState, offlineSyncActions] = useOfflineSync({
    autoSyncInterval: 30000,
    syncOnReconnect: true,
    onSyncComplete: (_success, _count) => {
      // Offline data synced successfully
    },
  });

  const [currentHoleIndex, setCurrentHoleIndex] = useState(startHoleIndex);
  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>(initialCompletedStats);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [inProgressShotsByHole, setInProgressShotsByHole] = useState<Record<number, ShotRecord[]>>(() => {
    if (initialShots.length === 0) {
      return {};
    }
    return { [startHoleIndex]: initialShots };
  });

  const [pendingFinalStats, setPendingFinalStats] = useState<HoleStats[] | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const handleHoleComplete = async (holeIndex: number, holeStats: HoleStats) => {
    // Update holes with score
    const updatedHoles = [...holes];
    updatedHoles[holeIndex] = {
      ...updatedHoles[holeIndex]!,
      score: holeStats.score,
    };
    setHoles(updatedHoles);

    // Store completed hole stats
    const updatedStats = [...completedHoleStats];
    updatedStats[holeIndex] = holeStats;
    setCompletedHoleStats(updatedStats);
    setInProgressShotsByHole((prev) => {
      if (!prev[holeIndex]) {
        return prev;
      }
      const next = { ...prev };
      delete next[holeIndex];
      return next;
    });

    // Move to next hole or prompt for finish confirmation
    if (holeIndex < holes.length - 1) {
      setCurrentHoleIndex(holeIndex + 1);
    } else {
      // Last hole - ask for confirmation before submitting
      setPendingFinalStats(updatedStats);
      setShowFinishConfirm(true);
    }
  };

  const handleHoleStatsUpdate = useCallback((holeIndex: number, holeStats: HoleStats) => {
    setHoles(prev => {
      const updated = [...prev];
      updated[holeIndex] = { ...updated[holeIndex]!, score: holeStats.score };
      return updated;
    });
    setCompletedHoleStats(prev => {
      const updated = [...prev];
      updated[holeIndex] = holeStats;
      return updated;
    });
  }, []);

  const handleSaveShot = (shot: ShotRecord) => {
    if (completedHoleStats[currentHoleIndex]) {
      return;
    }

    setInProgressShotsByHole((prev) => {
      const existing = prev[currentHoleIndex] ?? [];
      return { ...prev, [currentHoleIndex]: [...existing, shot] };
    });
  };

  /**
   * Auto-save handler for shot tracking - persists to IndexedDB when offline
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Sync parent's in-progress shots so hole navigation stays consistent after edits/deletes
    setInProgressShotsByHole(prev => {
      const existing = prev[holeIndex];
      if (existing && existing.length === shots.length && existing === shots) return prev;
      return { ...prev, [holeIndex]: shots };
    });

    // Save to IndexedDB for offline redundancy
    if (offlineSyncState.isIndexedDBReady) {
      try {
        const draftData = {
          step: 'tracking' as const,
          setupData,
          holes,
          completedHoleStats,
          currentHoleIndex: holeIndex,
          inProgressShots: { [holeIndex]: shots },
        };
        await offlineSyncActions.saveRoundOffline(
          roundId,
          '', // Player ID will be determined by the server
          draftData
        );
      } catch (error) {
        console.error('Failed to save to IndexedDB:', error);
      }
    }

    // Queue individual shots for offline sync if we're offline
    if (!offlineSyncState.isOnline && offlineSyncState.isIndexedDBReady) {
      for (const shot of shots) {
        try {
          await offlineSyncActions.queueShot(shot, roundId, holes[holeIndex]?.number || holeIndex + 1);
        } catch (error) {
          console.error('Failed to queue shot for offline sync:', error);
        }
      }
    }
  }, [
    offlineSyncState.isIndexedDBReady,
    offlineSyncState.isOnline,
    offlineSyncActions,
    roundId,
    setupData,
    holes,
    completedHoleStats,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    setSubmitting(true);
    setError('');

    try {
      const roundData = {
        courseName: setupData.courseName,
        courseCity: setupData.courseCity || undefined,
        courseState: setupData.courseState || undefined,
        courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
        courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
        teesPlayed: setupData.teesPlayed || undefined,
        roundType: setupData.roundType,
        roundDate: setupData.roundDate,
        holes: allHoleStats,
        qualifierId: setupData.qualifierId,
        qualifierRoundNumber: setupData.qualifierRoundNumber,
      };

      const result = await submitGolfRoundComprehensive(roundData, roundId);
      if (!result.success) {
        throw new Error(result.error);
      }

      // Warn if shot-level data failed to save (round + hole stats are safe)
      if (result.data.shotsSaved === false) {
        showToast('Round saved — shot details could not be saved. Score and stats are recorded, but club analytics may be incomplete.', 'warning');
      }

      // Clean up IndexedDB draft data for this round
      try {
        await deleteOfflineRound(roundId);
      } catch {
        // Non-critical — round is already saved
      }

      // Navigate to round detail page for full review
      const completedRoundId = result.data.roundId || roundId;
      router.push(`/golf/dashboard/rounds/${completedRoundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit round');
      // Keep submitting=true so error shows on the spinner screen with "Go Back"
    }
  };

  const handleSaveForLater = async () => {
    const inProgressShots = Object.entries(inProgressShotsByHole)
      .filter(([, shots]) => shots.length > 0)
      .map(([holeIndex, shots]) => ({
        holeNumber: holes[Number(holeIndex)]?.number ?? Number(holeIndex) + 1,
        shots,
      }));

    const partialRoundData = {
      courseName: setupData.courseName,
      courseCity: setupData.courseCity || undefined,
      courseState: setupData.courseState || undefined,
      courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
      courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
      teesPlayed: setupData.teesPlayed || undefined,
      roundType: setupData.roundType,
      roundDate: setupData.roundDate,
      qualifierId: setupData.qualifierId,
      currentHole: currentHoleIndex + 1, // Next hole player will resume on
      holesToPlay: holes.length as 9 | 18,
      holes: completedHoleStats,
      inProgressShots,
      holeConfigs: holes.map(hole => ({
        holeNumber: hole.number,
        par: hole.par,
        yardage: hole.yardage,
      })),
    };

    const result = await savePartialRound(partialRoundData, roundId);

    if (!result.success) {
      throw new Error(result.error);
    }

    setShowExitModal(false);

    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
  };

  const completedStatsForHole = completedHoleStats[currentHoleIndex];
  const inProgressShots = inProgressShotsByHole[currentHoleIndex] ?? [];
  const activeHoleShots = completedStatsForHole?.shots ?? inProgressShots;
  const activeShotNumber = activeHoleShots.length > 0 ? activeHoleShots.length + 1 : initialShotNumber;

  const handleDeleteRound = async () => {
    await deleteInProgressRound(roundId);

    setShowExitModal(false);

    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
  };

  // ============================================================================
  // SUBMITTING STATE
  // ============================================================================
  if (submitting) {
    const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
    const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="flex items-center justify-center gap-2 mx-auto mb-6">
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
            <span className="w-3 h-3 rounded-full bg-primary-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
          </div>
          <h2 className="text-2xl font-bold text-warm-900 mb-2">
            Completing Round...
          </h2>
          <p className="text-warm-600 mb-4">
            Score: {totalScore} ({toPar >= 0 ? '+' : ''}{toPar})
          </p>
          <p className="text-sm text-warm-500">
            Calculating your 50+ statistics...
          </p>
          {error && (
            <div className="mt-4">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={() => setSubmitting(false)}
                className="px-4 py-2 bg-warm-100 text-warm-700 rounded-lg text-sm font-medium hover:bg-warm-200 transition-colors"
              >
                Go Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // TRACKING VIEW
  // ============================================================================
  return (
    <>
      {/* Header Banner */}
      <div className="bg-primary-50 border-b border-primary-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary-900">
              Continuing Round
            </p>
            <p className="text-xs text-primary-700">
              {setupData.courseName} • Starting on hole {startHoleIndex + 1}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-primary-700">
              {completedHoleStats.filter(s => s !== undefined).length} of {holes.length} holes
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Offline Indicator Banner */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <OfflineIndicator
          isOnline={offlineSyncState.isOnline}
          isSyncing={offlineSyncState.isSyncing}
          pendingCount={offlineSyncState.pendingCount}
          lastSuccessfulSync={offlineSyncState.lastSuccessfulSync}
          syncError={offlineSyncState.syncError}
          onSyncNow={offlineSyncActions.syncNow}
          onRetrySync={offlineSyncActions.retryFailedSync}
          onDismissError={offlineSyncActions.clearSyncError}
          variant="full"
          position="header"
        />
      </div>

      {/* Shot Tracking */}
      <ShotTrackingComprehensive
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        onHoleComplete={handleHoleComplete}
        onHoleStatsUpdate={handleHoleStatsUpdate}
        onSaveShot={handleSaveShot}
        onExit={() => setShowExitModal(true)}
        onNavigateToHole={(holeIndex) => setCurrentHoleIndex(holeIndex)}
        initialShots={activeHoleShots}
        initialShotNumber={activeShotNumber}
        onAutoSave={handleAutoSave}
        autoSaveInterval={15000}
      />

      {/* Save Round Modal */}
      <SaveRoundModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveForLater={handleSaveForLater}
        onDelete={handleDeleteRound}
        currentHole={currentHoleIndex + 1}
        totalHoles={holes.length}
      />

      {/* Finish Round Confirmation */}
      {showFinishConfirm && pendingFinalStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm" onClick={() => setShowFinishConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-semibold text-warm-900 mb-2">Submit Round?</h3>
            <p className="text-sm text-warm-500 mb-6">
              All {holes.length} holes are complete. Submit your round for scoring?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 transition-colors"
              >
                Review
              </button>
              <button
                onClick={async () => {
                  setShowFinishConfirm(false);
                  await handleRoundSubmit(pendingFinalStats);
                }}
                className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
