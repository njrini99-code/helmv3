'use client';

import { startTransition, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound, type PartialRoundData } from '@/app/golf/actions/golf';
import { checkRoundStaleness } from '@/app/golf/actions/round-drafts';
import { deleteOfflineRound, saveOfflineRound } from '@/lib/offline/indexed-db';
import { beaconPartialSave } from '@/lib/offline/partial-save-beacon';
import {
  emergencySave,
  loadEmergencySave,
  clearEmergencySave,
  isRecoverableRoundSubmitError,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useOfflineSync } from '@/hooks/golf/use-offline-sync';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { useToast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';
import { Skeleton } from '@/components/fairway';

// Round-completion-only overlays — never rendered until the round is
// finished, so keep them out of the initial hole-entry bundle (perf audit
// 2026-07-09, bundle finding 4). Same no-ssr-flag, .then((m) => m.X) pattern
// as FairwayCalendar.tsx's CalendarFeedManager.
//
// Each of these is mounted unconditionally (open/visible state gates them
// internally), so on a slow or offline-then-reconnecting course connection
// the chunk can still be in flight the moment the player taps "finish" —
// a `loading` fallback (matching GenomeRadar's pattern in
// FairwayMyGameProfile.tsx) means that tap shows a shape-matched sheet
// skeleton instead of nothing (CodeRabbit #797 cluster-4 finding 2).
const FairwaySaveRoundModal = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwaySaveRoundModal').then((m) => m.FairwaySaveRoundModal),
  { loading: () => <Skeleton className="h-64 w-full rounded-fw-lg" /> },
);
const FairwayRoundSubmitOverlay = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSubmitOverlay').then((m) => m.FairwayRoundSubmitOverlay),
  { loading: () => <Skeleton className="h-64 w-full rounded-fw-lg" /> },
);
const FairwayRoundSummarySheet = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSummarySheet').then((m) => m.FairwayRoundSummarySheet),
  { loading: () => <Skeleton className="h-64 w-full rounded-fw-lg" /> },
);

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
  // Mirrors new-round-client so the resume flow shares the exact same
  // exit-sheet + submit overlay as a fresh round.
  const ExitRoundModal = FairwaySaveRoundModal;
  const SubmitOverlay = FairwayRoundSubmitOverlay;

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
  const pendingServerSaveRef = useRef<{ shots: ShotRecord[]; holeIndex: number; roundData?: PartialRoundData } | null>(null);
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
    // Warn before closing tab/navigating away only when there's unsaved progress
    // that could be lost (mirrors new-round-client's gate). No data → no warning,
    // and never warn while the round is mid-submit.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmittingRef.current) return;
      const hasUnsavedChanges =
        completedHoleStatsRef.current.some((s) => s != null) ||
        Object.keys(inProgressShotsByHoleRef.current).length > 0;
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
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
      // Unload-safe delivery — see new-round-client: a plain server-action fetch
      // is killed on page freeze, so sendBeacon guarantees the in-progress round
      // reaches the server and stays resumable.
      beaconPartialSave(saveData, roundId);
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
                    const r = await savePartialRound(pending.roundData!, roundId);
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
    showAutoSaveWarning,
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
      {/* Header Banner — "Continuing Round" resume context, on Fairway tokens
          inside .fairway-ds so it matches the warm-black scorecard band below it. */}
      <div className={fairwayScope('bg-surface border-b border-border-subtle px-4 py-3')}>
        <div className="max-w-[720px] mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-fw-md bg-accent-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-fw-sans text-body-sm font-medium text-text-primary">
              Continuing Round
            </p>
            <p className="font-fw-sans text-caption text-text-secondary">
              {setupData.courseName} • Starting on hole {startHoleIndex + 1}
            </p>
          </div>
          <div className="text-right">
            <p className="font-fw-sans text-caption font-medium text-text-secondary">
              {completedHoleStats.filter(s => s != null).length} of {holes.length} holes
            </p>
          </div>
        </div>
      </div>

      {/* Error Display — Fairway danger tokens. */}
      {error && (
        <div className={fairwayScope('max-w-[720px] mx-auto px-4 py-4')}>
          <div role="alert" className="bg-fw-danger-bg border border-fw-danger/30 text-fw-danger-ink px-4 py-3 rounded-fw-md font-fw-sans text-body-sm">
            {error}
          </div>
        </div>
      )}

      {/* Offline Indicator Banner — OfflineIndicator itself renders its OWN
          `fixed top-0 left-0 right-0 z-50` div when variant="full" (its
          wrapper here doesn't establish a containing block, so wrapping
          styles alone can't move it). Override just that child's `top` via
          the SAME --scorecard-height CSS var FairwayScorecardHeader already
          publishes (ShotPills/ShotTracking consume it the identical way),
          so the banner sits below the sticky hole-nav bar instead of on top
          of it once scrolled. `!` wins over the component's own `top-0`
          utility at equal specificity without editing OfflineIndicator.tsx
          (a shared primitive outside this fix's ownership). */}
      <div className="[&>div]:!top-[var(--scorecard-height,105px)]">
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

      {/* Submit banner — shown when all holes are done but finish confirm was dismissed.
          An on-dark "cockpit" band on Fairway tokens so it reads as one surface
          with the warm-black scorecard band. */}
      {pendingFinalStats && !showFinishConfirm && !submitting && (
        <div className={fairwayScope('on-dark sticky top-[var(--golf-mobile-header-offset)] z-20 bg-nav-bg px-4 py-3 text-nav-text lg:top-[49px] flex items-center justify-between gap-3')}>
          <p className="font-fw-sans text-body-sm font-medium text-nav-text">All holes completed — ready to submit!</p>
          <Button
            variant="primary"
            onClick={() => setShowFinishConfirm(true)}
            className="flex-shrink-0 rounded-fw-md bg-accent-500 px-4 py-2 font-fw-sans text-body-sm font-medium text-text-on-accent transition-colors hover:bg-accent-600 active:bg-accent-600"
          >
            Submit Round
          </Button>
        </div>
      )}

      {/* Shot Tracking — presentation only, no mutation/autosave logic moves. */}
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayShotTracking
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
      </div>

      {/* Save Round Modal (matches new-round) */}
      <ExitRoundModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveForLater={handleSaveForLater}
        onDelete={handleDeleteRound}
        currentHole={currentHoleIndex + 1}
        totalHoles={holes.length}
      />

      {/* Emergency Save Recovery Dialog */}
      <Drawer
        open={Boolean(showRecoveryDialog && recoveryData)}
        onOpenChange={(next) => {
          if (!next) setShowRecoveryDialog(false);
        }}
      >
        <DrawerContent className="sm:max-w-sm sm:mx-auto sm:rounded-3xl">
          <div className="px-6 pb-6 pt-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <DrawerTitle className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] text-center mb-2">
              Recover Unsaved Progress?
            </DrawerTitle>
            <p className="text-sm text-warm-500 text-center mb-1">
              Found locally saved data from{' '}
              {recoveryData ? (() => {
                const seconds = Math.floor((Date.now() - recoveryData.timestamp) / 1000);
                if (seconds < 60) return 'just now';
                if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
                return `${Math.floor(seconds / 3600)}h ago`;
              })() : ''}
            </p>
            <p className="text-sm text-warm-500 text-center mb-6">
              {recoveryData?.completedHoleStats.filter(h => h != null).length ?? 0} completed holes found in local backup.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost"
                onClick={() => {
                  clearEmergencySave(roundId);
                  setShowRecoveryDialog(false);
                  setRecoveryData(null);
                }}
                className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 transition-colors"
              >
                Discard
              </Button>
              <Button variant="primary"
                onClick={() => {
                  // Restore data from emergency save
                  if (!recoveryData) return;
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
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Finish Round — Premium Round Summary, mirroring new-round-client. */}
      <FairwayRoundSummarySheet
        open={Boolean(showFinishConfirm && pendingFinalStats)}
        onOpenChange={(next) => {
          if (!next) setShowFinishConfirm(false);
        }}
        finalStats={pendingFinalStats ?? []}
        courseName={setupData.courseName}
        onGoBack={() => setShowFinishConfirm(false)}
        onSubmit={async () => {
          if (!pendingFinalStats) return;
          setShowFinishConfirm(false);
          await handleRoundSubmit(pendingFinalStats);
        }}
      />

      {/* Submit Overlay — shows during submission, success celebration, and
          errors (matches new-round). */}
      <SubmitOverlay
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
