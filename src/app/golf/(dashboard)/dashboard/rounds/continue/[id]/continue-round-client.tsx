'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive from '@/components/golf/ShotTrackingComprehensive';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound } from '@/app/golf/actions/golf';
import { deleteOfflineRound } from '@/lib/offline/indexed-db';
import { emergencySave, loadEmergencySave, clearEmergencySave, type EmergencySaveData } from '@/lib/utils/emergency-save';

import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import { useOfflineSync } from '@/hooks/golf/use-offline-sync';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { useToast } from '@/components/ui/toast';

type Hole = RoundHole;

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
  initialInProgressShotsByHole?: Record<number, ShotRecord[]>;
  serverDataTimestamp?: string;
}

export default function ContinueRoundClient({
  roundId,
  setupData,
  holes: initialHoles,
  completedHoleStats: initialCompletedStats,
  startHoleIndex,
  initialShots = [],
  initialShotNumber = 1,
  initialInProgressShotsByHole,
  serverDataTimestamp,
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
    // Use the full map of in-progress shots from all non-completed holes if available
    if (initialInProgressShotsByHole && Object.keys(initialInProgressShotsByHole).length > 0) {
      return initialInProgressShotsByHole;
    }
    // Fallback: use just the starting hole's shots
    if (initialShots.length === 0) {
      return {};
    }
    return { [startHoleIndex]: initialShots };
  });

  const [pendingFinalStats, setPendingFinalStats] = useState<HoleStats[] | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  // Concurrency lock for background server saves
  const serverSaveInProgressRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingServerSaveRef = useRef<{ shots: ShotRecord[]; holeIndex: number; roundData?: any } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
  const isSubmittingRef = useRef(false);
  // Track the furthest hole the player has naturally progressed to (for re-edit navigation)
  const activeProgressHoleRef = useRef(startHoleIndex);
  // Ref for stale closure prevention in async saves
  const inProgressShotsByHoleRef = useRef(inProgressShotsByHole);
  inProgressShotsByHoleRef.current = inProgressShotsByHole;

  // Emergency save recovery state
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveryData, setRecoveryData] = useState<EmergencySaveData | null>(null);

  // Refs for visibility change handler — prevents stale closures
  const completedHoleStatsRef = useRef(completedHoleStats);
  completedHoleStatsRef.current = completedHoleStats;
  const holesRef = useRef(holes);
  holesRef.current = holes;
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;

  // Check for emergency save on mount — recover data that was saved to localStorage
  // when the async server save was killed by iOS page freeze
  useEffect(() => {
    const emergencyData = loadEmergencySave(roundId);
    if (!emergencyData) return;

    // If server data is newer, discard stale local data
    if (serverDataTimestamp) {
      const serverTime = new Date(serverDataTimestamp).getTime();
      if (emergencyData.timestamp <= serverTime) {
        clearEmergencySave(roundId);
        return;
      }
    }

    // Emergency save is newer — show recovery dialog
    setShowRecoveryDialog(true);
    setRecoveryData(emergencyData);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run on mount
  }, []);

  // Save data when user leaves the page (phone lock, app switch, tab close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    // Trigger SYNCHRONOUS localStorage save + async server save when app goes to background
    const handlePageHide = () => {
      const mergedInProgress = { ...inProgressShotsByHoleRef.current };
      const holesSnapshot = holesRef.current;
      const statsSnapshot = completedHoleStatsRef.current;
      const currentHole = currentHoleIndexRef.current;

      // 1. SYNCHRONOUS localStorage write — guaranteed to complete before page freeze
      emergencySave({
        roundId,
        timestamp: Date.now(),
        setupData,
        holes: holesSnapshot,
        completedHoleStats: statsSnapshot,
        inProgressShotsByHole: mergedInProgress,
        currentHoleIndex: currentHole,
      });

      // 2. Best-effort async server save (may be killed by browser on mobile)
      const inProgressArr = Object.entries(mergedInProgress)
        .filter(([, shots]) => shots.length > 0)
        .map(([idx, shots]) => ({
          holeNumber: holesSnapshot[Number(idx)]?.number ?? Number(idx) + 1,
          shots,
        }));
      const saveData = {
        courseName: setupData.courseName,
        courseCity: setupData.courseCity || undefined,
        courseState: setupData.courseState || undefined,
        courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
        courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
        teesPlayed: setupData.teesPlayed || undefined,
        roundType: setupData.roundType,
        roundDate: setupData.roundDate,
        currentHole: currentHole + 1,
        holesToPlay: holesSnapshot.length as 9 | 18,
        holes: statsSnapshot,
        inProgressShots: inProgressArr,
        holeConfigs: holesSnapshot.map(hole => ({
          holeNumber: hole.number,
          par: hole.par,
          yardage: hole.yardage,
        })),
      };
      void savePartialRound(saveData, roundId);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handlePageHide();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // pagehide fires on iOS when switching apps — more reliable than visibilitychange
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [roundId, setupData]); // Only stable values — holes/stats/holeIndex read from refs

  // Browser back button protection — prevents accidental data loss
  useEffect(() => {
    // Push a sentinel history entry so we can detect back navigation
    window.history.pushState({ shotTracking: true }, '');

    const handlePopState = () => {
      // Re-push state to prevent actual navigation
      window.history.pushState({ shotTracking: true }, '');
      // Show the exit confirmation modal
      setShowExitModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  /**
   * Build partial round data for server persistence.
   * Accepts overrides for values that may not be in React state yet (e.g. inside handleHoleComplete).
   */
  const buildPartialRoundData = useCallback((
    overrideStats?: HoleStats[],
    overrideCurrentHole?: number,
    overrideInProgress?: Record<number, ShotRecord[]>,
  ) => {
    const statsToUse = overrideStats ?? completedHoleStats;
    const holeIndexToUse = overrideCurrentHole ?? currentHoleIndex;
    const inProgressMap = overrideInProgress ?? inProgressShotsByHole;

    const inProgressShotsArr = Object.entries(inProgressMap)
      .filter(([, shots]) => shots.length > 0)
      .map(([idx, shots]) => ({
        holeNumber: holes[Number(idx)]?.number ?? Number(idx) + 1,
        shots,
      }));

    return {
      courseName: setupData.courseName,
      courseCity: setupData.courseCity || undefined,
      courseState: setupData.courseState || undefined,
      courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
      courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
      teesPlayed: setupData.teesPlayed || undefined,
      roundType: setupData.roundType,
      roundDate: setupData.roundDate,
      qualifierId: setupData.qualifierId,
      qualifierRoundNumber: setupData.qualifierRoundNumber,
      currentHole: holeIndexToUse + 1,
      holesToPlay: holes.length as 9 | 18,
      holes: statsToUse,
      inProgressShots: inProgressShotsArr,
      holeConfigs: holes.map(hole => ({
        holeNumber: hole.number,
        par: hole.par,
        yardage: hole.yardage,
      })),
    };
  }, [completedHoleStats, currentHoleIndex, inProgressShotsByHole, holes, setupData]);

  const handleHoleComplete = async (holeIndex: number, holeStats: HoleStats) => {
    // Detect re-edit: hole already had completed stats before this call
    const isReEdit = !!completedHoleStats[holeIndex]?.score;

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

    // Remove completed hole from in-progress map (capture snapshot for server save)
    const inProgressAfter = { ...inProgressShotsByHole };
    delete inProgressAfter[holeIndex];
    setInProgressShotsByHole((prev) => {
      if (!prev[holeIndex]) {
        return prev;
      }
      const next = { ...prev };
      delete next[holeIndex];
      return next;
    });

    // Immediate localStorage backup of completed hole (synchronous, guaranteed)
    emergencySave({
      roundId,
      timestamp: Date.now(),
      setupData,
      holes: updatedHoles,
      completedHoleStats: updatedStats,
      inProgressShotsByHole: inProgressAfter,
      currentHoleIndex: isReEdit ? activeProgressHoleRef.current : holeIndex + 1,
    });

    // Fire-and-forget: persist completed hole data to database (non-blocking)
    // Uses queue pattern to avoid silently dropping saves
    void (async () => {
      const nextHole = isReEdit ? activeProgressHoleRef.current : holeIndex + 1;
      const saveData = buildPartialRoundData(updatedStats, nextHole, inProgressAfter);

      if (serverSaveInProgressRef.current) {
        // Queue — will be picked up when current save completes
        pendingServerSaveRef.current = { shots: [], holeIndex: -1, roundData: saveData };
        return;
      }
      serverSaveInProgressRef.current = true;
      try {
        const result = await savePartialRound(saveData, roundId);
        if (result.success) {
          consecutiveSaveFailuresRef.current = 0;
        } else {
          consecutiveSaveFailuresRef.current++;
          if (consecutiveSaveFailuresRef.current >= 2) {
            showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
          }
        }
      } catch {
        consecutiveSaveFailuresRef.current++;
        if (consecutiveSaveFailuresRef.current >= 2) {
          showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
        }
      } finally {
        serverSaveInProgressRef.current = false;
        // If a newer save was queued while we were saving, execute it now
        const pending = pendingServerSaveRef.current;
        if (pending) {
          pendingServerSaveRef.current = null;
          const pendingData = pending.roundData ?? buildPartialRoundData();
          void (async () => {
            serverSaveInProgressRef.current = true;
            try {
              const r = await savePartialRound(pendingData, roundId);
              if (r.success) consecutiveSaveFailuresRef.current = 0;
            } catch { /* non-critical */ } finally {
              serverSaveInProgressRef.current = false;
            }
          })();
        }
      }
    })();

    // Navigate after completion
    if (isReEdit) {
      // Re-editing a previously completed hole — return to the active frontier
      setCurrentHoleIndex(activeProgressHoleRef.current);
    } else if (holeIndex < holes.length - 1) {
      // Normal progression — advance to next hole
      const nextHole = holeIndex + 1;
      setCurrentHoleIndex(nextHole);
      activeProgressHoleRef.current = nextHole;
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
      // Prevent duplicate shots when navigating back to an uncompleted hole
      const duplicateIndex = existing.findIndex(s => s.shotNumber === shot.shotNumber);
      if (duplicateIndex >= 0) {
        const updated = [...existing];
        updated[duplicateIndex] = shot;
        return { ...prev, [currentHoleIndex]: updated };
      }
      return { ...prev, [currentHoleIndex]: [...existing, shot] };
    });
  };

  /**
   * Auto-save handler for shot tracking - persists to localStorage + IndexedDB + server
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Sync parent's in-progress shots so hole navigation stays consistent after edits/deletes
    let allInProgressShots: Record<number, ShotRecord[]> = {};
    setInProgressShotsByHole(prev => {
      const existing = prev[holeIndex];
      const updated = (existing && existing.length === shots.length && existing === shots)
        ? prev
        : { ...prev, [holeIndex]: shots };
      allInProgressShots = updated;
      return updated;
    });

    // SYNCHRONOUS localStorage backup — always runs, always completes
    emergencySave({
      roundId,
      timestamp: Date.now(),
      setupData,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: { ...allInProgressShots, [holeIndex]: shots },
      currentHoleIndex: holeIndex,
    });

    // Save to IndexedDB for offline redundancy — include ALL in-progress holes, not just current
    if (offlineSyncState.isIndexedDBReady) {
      try {
        const draftData = {
          step: 'tracking' as const,
          setupData,
          holes,
          completedHoleStats,
          currentHoleIndex: holeIndex,
          inProgressShots: allInProgressShots,
        };
        await offlineSyncActions.saveRoundOffline(
          roundId,
          '', // Player ID will be determined by the server
          draftData
        );
      } catch {
        // Silently ignore offline save errors
      }
    }

    // Queue individual shots for offline sync if we're offline
    if (!offlineSyncState.isOnline && offlineSyncState.isIndexedDBReady) {
      for (const shot of shots) {
        try {
          await offlineSyncActions.queueShot(shot, roundId, holes[holeIndex]?.number || holeIndex + 1);
        } catch {
          // Silently ignore offline queue errors
        }
      }
    }

    // Background save to database — protects mid-hole shot data
    // Uses ref-based data to avoid stale closure, plus queue for concurrent saves
    if (offlineSyncState.isOnline) {
      if (serverSaveInProgressRef.current) {
        // Queue this save — it will execute after the current one completes
        pendingServerSaveRef.current = { shots, holeIndex };
      } else {
        const executeServerSave = async (saveShots: ShotRecord[], saveHoleIndex: number) => {
          serverSaveInProgressRef.current = true;
          try {
            const mergedInProgress = { ...inProgressShotsByHoleRef.current, [saveHoleIndex]: saveShots };
            const result = await savePartialRound(
              buildPartialRoundData(undefined, saveHoleIndex, mergedInProgress),
              roundId
            );
            if (result.success) {
              consecutiveSaveFailuresRef.current = 0;
            } else {
              consecutiveSaveFailuresRef.current++;
              if (consecutiveSaveFailuresRef.current >= 2) {
                showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
              }
            }
          } catch {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
            }
          } finally {
            serverSaveInProgressRef.current = false;
            // If a newer save was queued while we were saving, execute it now
            const pending = pendingServerSaveRef.current;
            if (pending) {
              pendingServerSaveRef.current = null;
              if (pending.roundData) {
                // Queued from handleHoleComplete
                void (async () => {
                  serverSaveInProgressRef.current = true;
                  try {
                    const r = await savePartialRound(pending.roundData, roundId);
                    if (r.success) consecutiveSaveFailuresRef.current = 0;
                  } catch { /* non-critical */ } finally {
                    serverSaveInProgressRef.current = false;
                  }
                })();
              } else {
                void executeServerSave(pending.shots, pending.holeIndex);
              }
            }
          }
        };
        void executeServerSave(shots, holeIndex);
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
    buildPartialRoundData,
    showToast,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError('');

    try {
      // Save pre-submit snapshot to localStorage as insurance
      emergencySave({
        roundId,
        timestamp: Date.now(),
        setupData,
        holes,
        completedHoleStats: allHoleStats,
        inProgressShotsByHole: {},
        currentHoleIndex: holes.length - 1,
      });

      // Wait for any in-flight background save to complete before submitting
      // to prevent concurrent writes that can corrupt the round
      if (serverSaveInProgressRef.current) {
        await new Promise<void>(resolve => {
          const check = () => {
            if (!serverSaveInProgressRef.current) {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
          // Safety timeout — don't wait forever
          setTimeout(resolve, 3000);
        });
      }

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

      // Clean up IndexedDB draft data and emergency save for this round
      clearEmergencySave(roundId);
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
      isSubmittingRef.current = false;
      setSubmitting(false);
      // Re-arm the finish confirmation so "Go Back" returns to it instead of
      // dumping the user back on hole 18 with no way to retry submission
      setPendingFinalStats(allHoleStats);
      setShowFinishConfirm(true);
    }
  };

  const handleSaveForLater = async () => {
    try {
      const result = await savePartialRound(buildPartialRoundData(), roundId);

      if (!result.success) {
        showToast(result.error || 'Failed to save round. Please try again.', 'error');
        return;
      }

      setShowExitModal(false);
      router.push('/golf/dashboard/rounds');
    } catch {
      showToast('Failed to save round. Please try again.', 'error');
    }
  };

  const completedStatsForHole = completedHoleStats[currentHoleIndex];
  const inProgressShots = inProgressShotsByHole[currentHoleIndex] ?? [];
  const activeHoleShots = completedStatsForHole?.shots ?? inProgressShots;
  const activeShotNumber = activeHoleShots.length > 0 ? activeHoleShots.length + 1 : initialShotNumber;

  const handleDeleteRound = async () => {
    try {
      const result = await deleteInProgressRound(roundId);
      if (result && 'success' in result && !result.success) {
        showToast?.('Failed to delete round. Please try again.', 'error');
        return;
      }
      clearEmergencySave(roundId);
      setShowExitModal(false);
      router.push('/golf/dashboard/rounds');
    } catch {
      showToast?.('Failed to delete round. Please try again.', 'error');
    }
  };

  // ============================================================================
  // SUBMITTING STATE
  // ============================================================================
  if (submitting) {
    const definedStats = completedHoleStats.filter((h): h is HoleStats => h != null);
    const totalScore = definedStats.reduce((sum, h) => sum + h.score, 0);
    const totalPar = definedStats.reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    return (
      <div className="min-h-dvh bg-transparent flex items-center justify-center">
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
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setSubmitting(false);
                    setError('');
                    // Re-show the finish confirmation so the user can retry
                    if (pendingFinalStats) {
                      setShowFinishConfirm(true);
                    }
                  }}
                  className="px-4 py-2 bg-warm-100 text-warm-700 rounded-lg text-sm font-medium hover:bg-warm-200 transition-colors"
                >
                  Go Back
                </button>
                {pendingFinalStats && (
                  <button
                    onClick={async () => {
                      setError('');
                      isSubmittingRef.current = false;
                      await handleRoundSubmit(pendingFinalStats);
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
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
              {completedHoleStats.filter(s => s != null).length} of {holes.length} holes
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

      {/* Emergency Save Recovery Dialog */}
      {showRecoveryDialog && recoveryData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-warm-900 text-center mb-2">
              Recover Unsaved Progress?
            </h3>
            <p className="text-sm text-warm-500 text-center mb-1">
              Found locally saved data from{' '}
              {(() => {
                const seconds = Math.floor((Date.now() - recoveryData.timestamp) / 1000);
                if (seconds < 60) return 'just now';
                if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
                return `${Math.floor(seconds / 3600)}h ago`;
              })()}
            </p>
            <p className="text-sm text-warm-500 text-center mb-6">
              {recoveryData.completedHoleStats.filter(h => h != null).length} completed holes found in local backup.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  clearEmergencySave(roundId);
                  setShowRecoveryDialog(false);
                  setRecoveryData(null);
                }}
                className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  // Restore data from emergency save
                  if (recoveryData.completedHoleStats) {
                    setCompletedHoleStats(recoveryData.completedHoleStats);
                  }
                  if (recoveryData.inProgressShotsByHole) {
                    setInProgressShotsByHole(recoveryData.inProgressShotsByHole);
                  }
                  if (recoveryData.holes && recoveryData.holes.length > 0) {
                    setHoles(recoveryData.holes);
                  }
                  if (recoveryData.currentHoleIndex != null) {
                    setCurrentHoleIndex(recoveryData.currentHoleIndex);
                    activeProgressHoleRef.current = recoveryData.currentHoleIndex;
                  }
                  setShowRecoveryDialog(false);
                  setRecoveryData(null);
                  // Don't clear emergency save yet — will be cleared after next successful server save
                }}
                className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

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
