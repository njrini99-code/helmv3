'use client';

import { startTransition, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive from '@/components/golf/ShotTrackingComprehensive';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound } from '@/app/golf/actions/golf';
import { checkRoundStaleness } from '@/app/golf/actions/round-drafts';
import { deleteOfflineRound, saveOfflineRound } from '@/lib/offline/indexed-db';
import {
  emergencySave,
  loadEmergencySave,
  clearEmergencySave,
  isRecoverableRoundSubmitError,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';

import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import { RoundSubmitOverlay } from '@/components/golf/RoundSubmitOverlay';
import { useOfflineSync } from '@/hooks/golf/use-offline-sync';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { useToast } from '@/components/ui/toast';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { IconFlag } from '@/components/icons';

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
  const [completedRoundId, setCompletedRoundId] = useState<string | null>(null);

  // Concurrency lock for background server saves
  const serverSaveInProgressRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingServerSaveRef = useRef<{ shots: ShotRecord[]; holeIndex: number; roundData?: any } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
  const lastAutoSaveWarningRef = useRef(0);
  const isSubmittingRef = useRef(false);
  // Optimistic locking: tracks the last server-side updated_at for conflict detection
  const lastServerUpdatedAtRef = useRef<string | undefined>(serverDataTimestamp);
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

  const redirectToCompletedRound = useCallback(() => {
    setError('');
    setSubmitting(false);
    isSubmittingRef.current = false;
    startTransition(() => {
      router.replace(`/golf/dashboard/rounds/${roundId}`);
    });
  }, [roundId, router]);

  const isCompletedRoundError = useCallback((message?: string) => {
    if (typeof message !== 'string') {
      return false;
    }

    const normalizedMessage = message.toLowerCase();
    return normalizedMessage.includes('already been completed')
      || normalizedMessage.includes('already been submitted')
      || normalizedMessage.includes('may have already been completed')
      || normalizedMessage.includes('already completed');
  }, []);

  const handleRoundSyncConflict = useCallback(async (fallbackMessage: string) => {
    try {
      const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
      if (stalenessResult.success) {
        if (stalenessResult.data.currentUpdatedAt) {
          lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt;
        }
        if (stalenessResult.data.status === 'completed') {
          redirectToCompletedRound();
          return;
        }
      }
    } catch {
      // Fall through to the generic conflict message below.
    }

    setError(fallbackMessage);
    showToast(fallbackMessage, 'error');
  }, [redirectToCompletedRound, roundId, showToast]);

  // Throttle auto-save warning to at most once per 60s to avoid toast spam
  const showAutoSaveWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoSaveWarningRef.current < 60_000) return;
    lastAutoSaveWarningRef.current = now;
    showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
  }, [showToast]);

  const persistFailedSubmission = useCallback(async (allHoleStats: HoleStats[]) => {
    emergencySave({
      roundId,
      timestamp: Date.now(),
      setupData,
      holes,
      completedHoleStats: allHoleStats,
      inProgressShotsByHole: {},
      currentHoleIndex: Math.max(0, holes.length - 1),
    });

    try {
      await saveOfflineRound({
        id: roundId,
        playerId: '',
        serverRoundId: roundId,
        draftData: {
          step: 'tracking',
          roundId,
          setupData,
          holes,
          completedHoleStats: allHoleStats,
          currentHoleIndex: Math.max(0, holes.length - 1),
          inProgressShots: {},
          submissionIntent: 'submit',
        },
      });
    } catch {
      // localStorage emergency save above remains the hard fallback
    }
  }, [holes, roundId, setupData]);

  useRoundStatusSync({
    roundId,
    expectedUpdatedAtRef: lastServerUpdatedAtRef,
    onRoundCompleted: redirectToCompletedRound,
  });

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

  // If ALL holes are already scored on mount (e.g., previous submit timed out
  // but auto-save had captured all scores), immediately show the submit dialog.
  // Without this, the user is stuck — submit only triggers from handleHoleComplete.
  useEffect(() => {
    const allScored = initialCompletedStats.length === initialHoles.length
      && initialHoles.every((_, i) => initialCompletedStats[i]?.score != null);
    if (allScored) {
      setPendingFinalStats(initialCompletedStats);
      setShowFinishConfirm(true);
    }
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
      // Skip save if round is being submitted — prevents "already completed" errors
      if (isSubmittingRef.current) return;

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
        currentHole: Math.max(1, Math.min(currentHole + 1, holesSnapshot.length)),
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
      currentHole: Math.max(1, Math.min(holeIndexToUse + 1, holes.length)),
      holesToPlay: holes.length as 9 | 18,
      holes: statsToUse,
      inProgressShots: inProgressShotsArr,
      holeConfigs: holes.map(hole => ({
        holeNumber: hole.number,
        par: hole.par,
        yardage: hole.yardage,
      })),
      expectedUpdatedAt: lastServerUpdatedAtRef.current,
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
          if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
        } else if (result.error === 'conflict') {
          void handleRoundSyncConflict('This round was updated on another device. Please reload.');
        } else if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
        } else {
          consecutiveSaveFailuresRef.current++;
          if (consecutiveSaveFailuresRef.current >= 2) {
            showAutoSaveWarning();
          }
        }
      } catch {
        consecutiveSaveFailuresRef.current++;
        if (consecutiveSaveFailuresRef.current >= 2) {
          showAutoSaveWarning();
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
              if (r.success) {
                consecutiveSaveFailuresRef.current = 0;
                if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
              } else if (r.error === 'conflict') {
                void handleRoundSyncConflict('This round was updated on another device. Please reload.');
              } else if (isCompletedRoundError(r.error)) {
                redirectToCompletedRound();
              }
            } catch { /* non-critical */ } finally {
              serverSaveInProgressRef.current = false;
            }
          })();
        }
      }
    })();

    // Navigate after completion
    // Check if every hole now has a score (all completed)
    const allHolesScored = updatedStats.length === holes.length && updatedStats.every(s => s?.score != null);

    if (allHolesScored && holeIndex === holes.length - 1) {
      // Last hole (re-)completed and all holes scored — always show finish confirmation
      setPendingFinalStats(updatedStats);
      setShowFinishConfirm(true);
    } else if (isReEdit) {
      if (allHolesScored) {
        // All holes scored after re-edit — show finish confirmation
        setPendingFinalStats(updatedStats);
        setShowFinishConfirm(true);
      } else {
        // Re-editing a previously completed hole — return to the active frontier
        setCurrentHoleIndex(activeProgressHoleRef.current);
      }
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
    // Skip auto-save entirely if the round has been submitted or is being submitted
    if (isSubmittingRef.current || completedRoundId) return;

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
              if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
            } else if (result.error === 'conflict') {
              void handleRoundSyncConflict('This round was updated on another device. Please reload.');
            } else if (isCompletedRoundError(result.error)) {
              redirectToCompletedRound();
            } else {
              consecutiveSaveFailuresRef.current++;
              if (consecutiveSaveFailuresRef.current >= 2) {
                showAutoSaveWarning();
              }
            }
          } catch {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showAutoSaveWarning();
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
                    if (r.success) {
                      consecutiveSaveFailuresRef.current = 0;
                      if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
                    } else if (r.error === 'conflict') {
                      void handleRoundSyncConflict('This round was updated on another device. Please reload.');
                    } else if (isCompletedRoundError(r.error)) {
                      redirectToCompletedRound();
                    }
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
    buildPartialRoundData,
    completedHoleStats,
    completedRoundId,
    handleRoundSyncConflict,
    holes,
    isCompletedRoundError,
    offlineSyncState.isIndexedDBReady,
    offlineSyncState.isOnline,
    offlineSyncActions,
    redirectToCompletedRound,
    roundId,
    setupData,
    showToast,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError('');
    // Clear any queued auto-save to prevent race conditions during submit
    pendingServerSaveRef.current = null;

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
          // Extended timeout — must wait for in-flight save to fully complete
          // to avoid concurrent database transactions
          setTimeout(resolve, 10000);
        });
      }

      // Multi-device conflict check: verify round hasn't been modified on another device
      if (lastServerUpdatedAtRef.current) {
        try {
          const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
          if (stalenessResult.success) {
            if (stalenessResult.data.currentUpdatedAt) {
              lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt;
            }
            if (stalenessResult.data.status === 'completed') {
              redirectToCompletedRound();
              return;
            }
            if (stalenessResult.data.isStale) {
              setError(
                'This round was modified on another device or browser tab. ' +
                'Please reload the page to get the latest data before submitting.'
              );
              isSubmittingRef.current = false;
              setSubmitting(false);
              return;
            }
          }
        } catch {
          // Non-critical — proceed with submission if check fails
        }
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
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
        throw new Error(result.error);
      }

      // Clean up IndexedDB draft data and emergency save for this round
      clearEmergencySave(roundId);
      try {
        await deleteOfflineRound(roundId);
      } catch {
        // Non-critical — round is already saved
      }

      // Show success celebration — the overlay auto-navigates to round review
      setCompletedRoundId(result.data.roundId || roundId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit round';
      if (isRecoverableRoundSubmitError(message)) {
        await persistFailedSubmission(allHoleStats);
        isSubmittingRef.current = false;
        setSubmitting(false);
        setError('');
        showToast('Round saved on this device. Opening recovery flow.', 'warning');
        startTransition(() => {
          router.push('/golf/dashboard/rounds/recover?from=submit');
        });
        return;
      }

      setError(message);
      isSubmittingRef.current = false;
      // Stay in submitting state so the overlay shows the error
    }
  };

  const handleSaveForLater = async () => {
    try {
      const result = await savePartialRound(buildPartialRoundData(), roundId);

      if (!result.success) {
        if (result.error === 'conflict') {
          await handleRoundSyncConflict('This round was updated on another device. Please reload.');
          return;
        }
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
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

  // Submitting overlay stats (computed once, used by overlay)
  const submittingDefinedStats = completedHoleStats.filter((h): h is HoleStats => h != null);
  const submittingTotalScore = submittingDefinedStats.reduce((sum, h) => sum + h.score, 0);
  const submittingTotalPar = submittingDefinedStats.reduce((sum, h) => sum + h.par, 0);
  const submittingToPar = submittingTotalScore - submittingTotalPar;

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

      {/* Submit banner — shown when all holes are done but finish confirm was dismissed */}
      {pendingFinalStats && !showFinishConfirm && !submitting && (
        <div className="sticky top-[var(--golf-mobile-header-offset)] z-20 bg-primary-600 px-4 py-3 text-white lg:top-[49px] flex items-center justify-between gap-3">
          <p className="text-sm font-medium">All holes completed — ready to submit!</p>
          <button
            onClick={() => setShowFinishConfirm(true)}
            className="px-4 py-2 rounded-lg bg-white text-primary-700 text-sm font-medium hover:bg-primary-50 active:bg-primary-100 transition-colors flex-shrink-0"
          >
            Submit Round
          </button>
        </div>
      )}

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
        autoSaveDisabled={submitting || !!completedRoundId}
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
            <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] text-center mb-2">
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

      {/* Finish Round — Premium Round Summary */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {showFinishConfirm && pendingFinalStats && (() => {
            const fs = pendingFinalStats;
            const totalScore = fs.reduce((sum, h) => sum + (h?.score ?? 0), 0);
            const totalPar = fs.reduce((sum, h) => sum + (h?.par ?? 0), 0);
            const toPar = totalScore - totalPar;
            const totalPutts = fs.reduce((sum, h) => sum + (h?.putts ?? 0), 0);
            const fairwaysHit = fs.filter(h => h?.fairwayHit === true).length;
            const fairwayEligible = fs.filter(h => h?.fairwayHit !== null).length;
            const girCount = fs.filter(h => h?.greenInRegulation === true).length;
            const colCount = Math.min(fs.length, 9);

            const ScoreCell = ({ h }: { h: HoleStats }) => {
              const diff = (h?.score ?? 0) - (h?.par ?? 0);
              const cls = diff <= -2 ? 'text-primary-700 bg-primary-100 font-medium'
                : diff === -1 ? 'text-primary-600 bg-primary-50/70 font-medium'
                : diff === 0 ? 'text-warm-700 bg-white font-medium'
                : diff === 1 ? 'text-amber-700 bg-amber-50/70 font-medium'
                : 'text-red-600 bg-red-50/70 font-medium';
              return (
                <div className={`text-center py-1.5 ${cls}`}>
                  <span className="text-xs">{h?.score}</span>
                </div>
              );
            };

            const toParLabel = toPar === 0 ? 'E' : `${toPar > 0 ? '+' : ''}${toPar}`;

            return (
              <m.div
                key="round-summary-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
              >
                <div className="fixed inset-0 bg-warm-900/60 backdrop-blur-md" />
                <m.div
                  initial={{ opacity: 0, scale: 0.92, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="relative glass-prominent rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
                >
                  {/* Celebration Header */}
                  <div className="relative overflow-hidden rounded-t-2xl bg-primary-600 px-6 pt-6 pb-5 text-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
                    <m.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15, duration: 0.4, type: 'spring', stiffness: 200, damping: 15 }}
                      className="relative"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3">
                        <IconFlag size={24} className="text-white" />
                      </div>
                      <h3 className="text-lg font-medium text-white/90 mb-1">Round Complete</h3>
                      <div className="flex items-baseline justify-center gap-2">
                        <m.span
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25, duration: 0.3 }}
                          className="text-[44px] md:text-[52px] font-light tracking-[-0.025em] text-white tabular-nums"
                        >
                          {totalScore}
                        </m.span>
                        <m.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.35 }}
                          className={`text-lg font-medium ${toPar === 0 ? 'text-white/70' : toPar < 0 ? 'text-primary-100' : 'text-red-200'}`}
                        >
                          ({toParLabel})
                        </m.span>
                      </div>
                      <p className="text-sm text-white/70 mt-1">{setupData.courseName}</p>
                    </m.div>
                  </div>

                  <div className="p-6">
                    {/* Key Stats */}
                    <m.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                      className="grid grid-cols-3 gap-3 mb-5"
                    >
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-[20px] font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{totalPutts}</p>
                        <p className="text-xs text-warm-500 font-medium">Putts</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-[20px] font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{fairwaysHit}/{fairwayEligible}</p>
                        <p className="text-xs text-warm-500 font-medium">Fairways</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-[20px] font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{girCount}/{fs.length}</p>
                        <p className="text-xs text-warm-500 font-medium">GIR</p>
                      </div>
                    </m.div>

                    {/* Mini Scorecard */}
                    <m.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.3 }}
                      className="mb-6"
                    >
                      <p className="text-[11px] font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-2">Scorecard</p>
                      <div className="rounded-xl border border-warm-200/35 overflow-x-auto overflow-hidden">
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((_, i) => (
                            <div key={`h${i}`} className="bg-warm-50 text-center py-1">
                              <span className="text-[10px] font-medium text-warm-400">{i + 1}</span>
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((h, i) => (
                            <div key={`p${i}`} className="bg-white text-center py-1">
                              <span className="text-[10px] text-warm-400">{h?.par}</span>
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((h, i) => (
                            <ScoreCell key={`s${i}`} h={h} />
                          ))}
                        </div>
                        {fs.length > 9 && (
                          <>
                            <div className="h-px bg-warm-300/40" />
                            <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                              {fs.slice(9, 18).map((_, i) => (
                                <div key={`h2${i}`} className="bg-warm-50 text-center py-1">
                                  <span className="text-[10px] font-medium text-warm-400">{i + 10}</span>
                                </div>
                              ))}
                            </div>
                            <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                              {fs.slice(9, 18).map((h, i) => (
                                <div key={`p2${i}`} className="bg-white text-center py-1">
                                  <span className="text-[10px] text-warm-400">{h?.par}</span>
                                </div>
                              ))}
                            </div>
                            <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                              {fs.slice(9, 18).map((h, i) => (
                                <ScoreCell key={`s2${i}`} h={h} />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </m.div>

                    {/* Action Buttons */}
                    <m.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                      className="flex gap-3"
                    >
                      <button
                        onClick={() => setShowFinishConfirm(false)}
                        className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 active:bg-warm-300 transition-colors"
                      >
                        Go Back
                      </button>
                      <button
                        onClick={async () => {
                          if (!pendingFinalStats) return;
                          setShowFinishConfirm(false);
                          await handleRoundSubmit(pendingFinalStats);
                        }}
                        className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm shadow-primary-950/10"
                      >
                        Submit Round
                      </button>
                    </m.div>
                  </div>
                </m.div>
              </m.div>
            );
          })()}
        </AnimatePresence>
      </LazyMotion>

      {/* Submit Overlay — shows during submission, success celebration, and errors */}
      <RoundSubmitOverlay
        isVisible={submitting}
        totalScore={submittingTotalScore}
        toPar={submittingToPar}
        courseName={setupData.courseName}
        error={error || undefined}
        completedRoundId={completedRoundId ?? undefined}
        onGoBack={() => {
          setSubmitting(false);
          setError('');
          isSubmittingRef.current = false;
          // Always re-show the finish confirm so user can submit again
          if (pendingFinalStats) {
            setShowFinishConfirm(true);
          }
        }}
        onRetry={pendingFinalStats ? () => {
          setError('');
          isSubmittingRef.current = false;
          void handleRoundSubmit(pendingFinalStats);
        } : undefined}
        onSaveAndExit={async () => {
          setError('');
          isSubmittingRef.current = false;
          setSubmitting(false);
          await handleSaveForLater();
        }}
        onDiscard={async () => {
          setError('');
          isSubmittingRef.current = false;
          setSubmitting(false);
          await handleDeleteRound();
        }}
      />

    </>
  );
}
