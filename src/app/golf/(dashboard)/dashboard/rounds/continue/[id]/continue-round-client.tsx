'use client';

import { startTransition, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound, type PartialRoundData } from '@/app/golf/actions/golf';
import { checkRoundStaleness, type TerminalRoundSubmissionData } from '@/app/golf/actions/round-drafts';
import { deleteOfflineRound, saveOfflineRound } from '@/lib/offline/indexed-db';
import { beaconPartialSave } from '@/lib/offline/partial-save-beacon';
import { getRoundRecoverySnapshot } from '@/lib/offline/shot-storage';
import { useOfflineSyncStore, useOfflineSyncStatus } from '@/stores/offline-sync-store';
import {
  emergencySave,
  loadEmergencySave,
  clearEmergencySave,
  clearEmergencySaveThrough,
  isEmergencySaveEquivalentToProgress,
  isRecoverableRoundSubmitError,
  migrateEmergencySave,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';
import { writeRoundRecreatingIfMissing } from '@/lib/golf/round-missing-recovery';

import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { useToast } from '@/components/ui/sonner';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';
import { Skeleton } from '@/components/fairway';
import { Button as FwButton } from '@/components/fairway/controls/button';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';

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

function hasAllHolesScored(holeStats: HoleStats[], roundHoles: Hole[]): boolean {
  return holeStats.length === roundHoles.length
    && roundHoles.every((_, index) => holeStats[index]?.score != null);
}

interface RoundSetupData {
  courseName: string;
  courseId?: string;
  teeId?: string;
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
  playerId: string;
  setupData: RoundSetupData;
  /** Safe, server-derived choices for a legacy qualifier row missing its number. */
  qualifierRoundNumberOptions?: number[];
  /** Explains why a legacy row cannot currently choose a safe result number. */
  qualifierRoundNumberUnavailableReason?: string;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  startHoleIndex: number;
  initialShots?: HoleStats['shots'];
  initialShotNumber?: number;
  initialInProgressShotsByHole?: Record<number, ShotRecord[]>;
  serverDataTimestamp?: string;
}

export default function ContinueRoundClient({
  roundId: routeRoundId,
  playerId,
  setupData,
  qualifierRoundNumberOptions = [],
  qualifierRoundNumberUnavailableReason,
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
  // After a re-create (recreateMissingRound below) the URL still names the
  // dead id until router.replace lands. Every save in that window must target
  // the row that now exists, or each one re-creates again and the player ends
  // up with duplicate in-progress rounds. Cleared once the route catches up.
  const recreatedRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (recreatedRoundIdRef.current === routeRoundId) recreatedRoundIdRef.current = null;
  }, [routeRoundId]);
  const roundId = recreatedRoundIdRef.current ?? routeRoundId;
  /** The id a save must target at call time, not at render time. */
  const liveRoundId = useCallback(
    () => recreatedRoundIdRef.current ?? routeRoundId,
    [routeRoundId],
  );
  // Mirrors new-round-client so the resume flow shares the exact same
  // exit-sheet + submit overlay as a fresh round.
  const ExitRoundModal = FairwaySaveRoundModal;
  const SubmitOverlay = FairwayRoundSubmitOverlay;
  // The dashboard-level OfflineProvider owns the one v2 sync engine. Continue
  // Round must observe that shared state rather than start the legacy v1 hook:
  // the old hook wrote every auto-save into a second queue, which then raced
  // the provider to sync the same round and could leave a stale restore prompt.
  const syncStatus = useOfflineSyncStatus();

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
  const [selectedQualifierRoundNumber, setSelectedQualifierRoundNumber] = useState<number | undefined>(
    setupData.qualifierRoundNumber,
  );
  const [showQualifierRoundNumberDialog, setShowQualifierRoundNumberDialog] = useState(false);

  // Concurrency lock for background server saves
  const serverSaveInProgressRef = useRef(false);
  const pendingServerSaveRef = useRef<{
    shots: ShotRecord[];
    holeIndex: number;
    roundData?: PartialRoundData;
    emergencyTimestamp?: number;
  } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
  const lastAutoSaveWarningRef = useRef(0);
  const isSubmittingRef = useRef(false);
  // Optimistic locking: tracks the last server-side updated_at for conflict detection
  const lastServerUpdatedAtRef = useRef<string | undefined>(serverDataTimestamp);
  // Track the furthest hole the player has naturally progressed to (for re-edit navigation)
  const activeProgressHoleRef = useRef(startHoleIndex);
  // A failed completed-hole checkpoint can be retried from the same hole. Keep
  // its original navigation intent so a retry does not get mistaken for a
  // player deliberately re-editing a previously saved hole.
  const pendingHoleCheckpointRef = useRef<{
    holeIndex: number;
    wasReEdit: boolean;
    activeProgressHoleIndex: number;
  } | null>(null);
  // A full scorecard is already durable one hole at a time. Do not create a
  // redundant local "recovery" copy while the player is deciding whether to
  // submit it; it is still available from Continue Round until submitted.
  const allHolesCheckpointedRef = useRef(
    hasAllHolesScored(initialCompletedStats, initialHoles),
  );
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

  const persistFailedSubmission = useCallback(async (
    allHoleStats: HoleStats[],
    recoverySetupData: RoundSetupData = setupData,
  ) => {
    const terminalSubmission: TerminalRoundSubmissionData = {
      courseName: recoverySetupData.courseName,
      courseId: recoverySetupData.courseId,
      teeId: recoverySetupData.teeId,
      courseCity: recoverySetupData.courseCity || undefined,
      courseState: recoverySetupData.courseState || undefined,
      courseRating: recoverySetupData.courseRating ? parseFloat(recoverySetupData.courseRating) : undefined,
      courseSlope: recoverySetupData.courseSlope ? parseInt(recoverySetupData.courseSlope) : undefined,
      teesPlayed: recoverySetupData.teesPlayed || undefined,
      roundType: recoverySetupData.roundType,
      roundDate: recoverySetupData.roundDate,
      holes: allHoleStats,
      qualifierId: recoverySetupData.qualifierId,
      qualifierRoundNumber: recoverySetupData.qualifierRoundNumber,
    };
    emergencySave({
      playerId,
      roundId,
      timestamp: Date.now(),
      setupData: recoverySetupData,
      holes,
      completedHoleStats: allHoleStats,
      inProgressShotsByHole: {},
      currentHoleIndex: Math.max(0, holes.length - 1),
      submissionIntent: 'submit',
      terminalSubmission,
    });

    try {
      await saveOfflineRound({
        id: roundId,
        playerId,
        serverRoundId: roundId,
        draftData: {
          step: 'tracking',
          roundId,
          setupData: recoverySetupData,
          holes,
          completedHoleStats: allHoleStats,
          currentHoleIndex: Math.max(0, holes.length - 1),
          inProgressShots: {},
          submissionIntent: 'submit',
          terminalSubmission,
        },
      });
    } catch {
      // localStorage emergency save above remains the hard fallback
    }
  }, [holes, playerId, roundId, setupData]);

  useRoundStatusSync({
    roundId,
    expectedUpdatedAtRef: lastServerUpdatedAtRef,
    onRoundCompleted: redirectToCompletedRound,
  });

  // Check for emergency save on mount — recover data that was saved to localStorage
  // when the async server save was killed by iOS page freeze
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The server page has already checked that this player owns `roundId`,
      // so it is safe to include a pre-owner browser backup for this exact
      // round while users transition from the older cache format.
      const localSnapshot = loadEmergencySave(roundId, playerId, { allowLegacyServerSnapshot: true });
      const indexedDbSnapshot = await getRoundRecoverySnapshot(
        roundId,
        playerId,
        { allowLegacyServerSnapshot: true },
      )
        .then((snapshot) => snapshot?.data ?? null)
        .catch(() => null);
      const emergencyData = [localSnapshot, indexedDbSnapshot]
        .filter((snapshot): snapshot is EmergencySaveData => snapshot != null)
        .sort((left, right) => right.timestamp - left.timestamp)[0];
      if (!emergencyData || cancelled) return;

    const serverInProgress = initialInProgressShotsByHole
      ?? (initialShots.length > 0 ? { [startHoleIndex]: initialShots } : {});

    // A phone can write its safety snapshot after the server has accepted the
    // exact same hole data. Timestamp-only logic mistakes that safe duplicate
    // for unsaved work on the next load. Compare progress first; never hide a
    // fallback that contains any distinct player-entered data.
    if (isEmergencySaveEquivalentToProgress(emergencyData, {
      holes: initialHoles,
      completedHoleStats: initialCompletedStats,
      inProgressShotsByHole: serverInProgress,
    })) {
      clearEmergencySave(roundId, playerId);
      return;
    }

    // If server data is newer, discard stale local data
    if (serverDataTimestamp) {
      const serverTime = new Date(serverDataTimestamp).getTime();
      if (emergencyData.timestamp <= serverTime) {
        clearEmergencySave(roundId, playerId);
        return;
      }
    }

    // Emergency save is newer — show recovery dialog
    setShowRecoveryDialog(true);
    setRecoveryData(emergencyData);
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run on mount
  }, []);

  // If ALL holes are already scored on mount (e.g., previous submit timed out
  // but auto-save had captured all scores), immediately show the submit dialog.
  // Without this, the user is stuck — submit only triggers from handleHoleComplete.
  useEffect(() => {
    const allScored = hasAllHolesScored(initialCompletedStats, initialHoles);
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
      if (isSubmittingRef.current || allHolesCheckpointedRef.current) return;
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
      if (isSubmittingRef.current || allHolesCheckpointedRef.current) return;

      const mergedInProgress = { ...inProgressShotsByHoleRef.current };
      const holesSnapshot = holesRef.current;
      const statsSnapshot = completedHoleStatsRef.current;
      const currentHole = currentHoleIndexRef.current;

      // 1. SYNCHRONOUS localStorage write — guaranteed to complete before page freeze
      emergencySave({
        playerId,
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
        holes: Array.from(
          { length: holesSnapshot.length },
          (_, index) => statsSnapshot[index] ?? null,
        ),
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
  }, [playerId, roundId, setupData]); // Only stable values — holes/stats/holeIndex read from refs

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
    const statsToUse = overrideStats ?? completedHoleStatsRef.current;
    const holeIndexToUse = overrideCurrentHole ?? currentHoleIndexRef.current;
    const inProgressMap = overrideInProgress ?? inProgressShotsByHoleRef.current;
    const roundHoles = holesRef.current;

    const inProgressShotsArr = Object.entries(inProgressMap)
      .filter(([, shots]) => shots.length > 0)
      .map(([idx, shots]) => ({
        holeNumber: roundHoles[Number(idx)]?.number ?? Number(idx) + 1,
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
      currentHole: Math.max(1, Math.min(holeIndexToUse + 1, roundHoles.length)),
      holesToPlay: roundHoles.length as 9 | 18,
      holes: Array.from(
        { length: roundHoles.length },
        (_, index) => statsToUse[index] ?? null,
      ),
      inProgressShots: inProgressShotsArr,
      holeConfigs: roundHoles.map(hole => ({
        holeNumber: hole.number,
        par: hole.par,
        yardage: hole.yardage,
      })),
      expectedUpdatedAt: lastServerUpdatedAtRef.current,
    };
  }, [setupData]);

  /**
   * The row this URL names is gone. Unlike the new-round screen we cannot just
   * forget the id — it IS the route — so re-create from the snapshot we are
   * already sending and move the player onto the round that now exists.
   * Retrying the dead id can only ever fail.
   *
   * One shared path for the completed-hole checkpoint, the mid-hole auto-save
   * and the queued follow-up. Until 2026-09-01 only the checkpoint had it:
   * against a vanished row every shot-level save incremented the breaker and
   * showed "Auto-save is having trouble" after two, while nothing re-created
   * until a hole completed.
   */
  const recreateMissingRound = useCallback(async (
    saveData: PartialRoundData,
    emergencyTimestamp: number,
    // The checkpoint path counts and surfaces its own failure after this
    // returns false; the auto-save paths rely on this to do it.
    surfaceFailure = true,
  ): Promise<boolean> => {
    const staleRoundId = liveRoundId();
    const recreated = await savePartialRound(saveData, undefined);
    if (!recreated.success) {
      if (surfaceFailure) {
        consecutiveSaveFailuresRef.current++;
        if (consecutiveSaveFailuresRef.current >= 2) showAutoSaveWarning();
      }
      return false;
    }
    consecutiveSaveFailuresRef.current = 0;
    // The expected updated_at belonged to the row that is gone. The CREATE
    // path returns none, and sending the old one against the fresh row would
    // come back as a spurious 'conflict'.
    lastServerUpdatedAtRef.current = recreated.data.updatedAt;
    recreatedRoundIdRef.current = recreated.data.roundId;
    // The snapshot was written under the dead id. Clearing through the new id
    // alone left that copy behind forever, and New Round later offered it as
    // recoverable against the dead id. Move anything newer than this save
    // onto the new id and drop the dead key.
    migrateEmergencySave(staleRoundId, recreated.data.roundId, playerId, emergencyTimestamp);
    router.replace(`/golf/dashboard/rounds/continue/${recreated.data.roundId}`);
    return true;
  }, [liveRoundId, playerId, router, showAutoSaveWarning]);

  /**
   * Completing a hole is a server checkpoint. Do not advance the player until
   * the full hole-and-shots snapshot is acknowledged by the existing round.
   */
  const persistCompletedHole = useCallback(async (
    saveData: PartialRoundData,
    emergencyTimestamp: number,
    surfaceFailure = true,
  ): Promise<boolean> => {
    pendingServerSaveRef.current = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const waitDeadline = Date.now() + 10_000;
      while (serverSaveInProgressRef.current && Date.now() < waitDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (serverSaveInProgressRef.current) break;

      serverSaveInProgressRef.current = true;
      try {
        const result = await savePartialRound(saveData, liveRoundId());
        if (result.success) {
          consecutiveSaveFailuresRef.current = 0;
          if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
          clearEmergencySaveThrough(roundId, playerId, emergencyTimestamp);
          return true;
        }
        if (result.error === 'conflict') {
          await handleRoundSyncConflict('This round was updated on another device. Please reload.');
          return false;
        }
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return false;
        }
        // The row this URL names is gone. Unlike the new-round screen we cannot
        // just forget the id — it IS the route — so re-create from the snapshot
        // we are already sending and move the player onto the round that now
        // exists. Retrying the dead id here can only ever fail.
        if (result.error === 'round_missing') {
          if (await recreateMissingRound(saveData, emergencyTimestamp, false)) return true;
          break;
        }
        if (result.error !== 'busy' && result.error !== 'retry') break;
      } catch {
        // Retry the finite checkpoint sequence below before asking the player
        // to intervene. The in-progress parent remains durable throughout.
      } finally {
        serverSaveInProgressRef.current = false;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    // Only a direct hole-out checkpoint should surface a retry state. The
    // periodic saver can race it while replaying the same complete snapshot;
    // that transient coalescing must not create a second false alarm.
    if (surfaceFailure) {
      consecutiveSaveFailuresRef.current++;
      setError('This hole has not saved yet. Keep this screen open and try again.');
      showAutoSaveWarning();
    }
    return false;
  }, [
    handleRoundSyncConflict,
    isCompletedRoundError,
    liveRoundId,
    playerId,
    recreateMissingRound,
    redirectToCompletedRound,
    roundId,
    showAutoSaveWarning,
  ]);

  const handleHoleComplete = async (holeIndex: number, holeStats: HoleStats): Promise<boolean> => {
    allHolesCheckpointedRef.current = false;
    const pendingCheckpoint = pendingHoleCheckpointRef.current;
    const isCheckpointRetry = pendingCheckpoint?.holeIndex === holeIndex;
    // Retries retain the original intent. Without this, the retry sees the
    // optimistic local score and treats a first-time completion as a re-edit,
    // leaving the golfer stranded on a hole that did save successfully.
    const isReEdit = isCheckpointRetry
      ? pendingCheckpoint.wasReEdit
      : !!completedHoleStatsRef.current[holeIndex]?.score;
    const activeProgressHoleIndex = isCheckpointRetry
      ? pendingCheckpoint.activeProgressHoleIndex
      : activeProgressHoleRef.current;
    if (!isCheckpointRetry) {
      pendingHoleCheckpointRef.current = {
        holeIndex,
        wasReEdit: isReEdit,
        activeProgressHoleIndex,
      };
    }

    // Update holes with score
    const updatedHoles = [...holesRef.current];
    updatedHoles[holeIndex] = {
      ...updatedHoles[holeIndex]!,
      score: holeStats.score,
    };
    holesRef.current = updatedHoles;
    setHoles(updatedHoles);

    // Store completed hole stats
    const updatedStats = [...completedHoleStatsRef.current];
    updatedStats[holeIndex] = holeStats;
    completedHoleStatsRef.current = updatedStats;
    setCompletedHoleStats(updatedStats);

    // Remove completed hole from in-progress map (capture snapshot for server save)
    const inProgressAfter = { ...inProgressShotsByHoleRef.current };
    delete inProgressAfter[holeIndex];
    inProgressShotsByHoleRef.current = inProgressAfter;
    setInProgressShotsByHole(inProgressAfter);

    // Immediate localStorage backup of completed hole (synchronous, guaranteed)
    const emergencyTimestamp = Date.now();
    emergencySave({
      playerId,
      roundId,
      timestamp: emergencyTimestamp,
      setupData,
      holes: updatedHoles,
      completedHoleStats: updatedStats,
      inProgressShotsByHole: inProgressAfter,
      currentHoleIndex: isReEdit ? activeProgressHoleIndex : holeIndex + 1,
    });

    const nextHole = isReEdit ? activeProgressHoleIndex : holeIndex + 1;
    const checkpointed = await persistCompletedHole(
      buildPartialRoundData(updatedStats, nextHole, inProgressAfter),
      emergencyTimestamp,
    );
    if (!checkpointed) return false;
    pendingHoleCheckpointRef.current = null;

    // Navigate after completion
    // Check if every hole now has a score (all completed)
    const allHolesScored = hasAllHolesScored(updatedStats, holes);
    allHolesCheckpointedRef.current = allHolesScored;

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
        setCurrentHoleIndex(activeProgressHoleIndex);
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
    return true;
  };

  const handleHoleStatsUpdate = useCallback((holeIndex: number, holeStats: HoleStats | null) => {
    const updatedHoles = [...holesRef.current];
    const updatedStats = [...completedHoleStatsRef.current];
    if (holeStats) {
      updatedHoles[holeIndex] = { ...updatedHoles[holeIndex]!, score: holeStats.score };
      updatedStats[holeIndex] = holeStats;
      const withoutCompletedHole = { ...inProgressShotsByHoleRef.current };
      delete withoutCompletedHole[holeIndex];
      inProgressShotsByHoleRef.current = withoutCompletedHole;
      setInProgressShotsByHole(withoutCompletedHole);
    } else {
      updatedHoles[holeIndex] = { ...updatedHoles[holeIndex]!, score: null };
      delete updatedStats[holeIndex];
    }
    holesRef.current = updatedHoles;
    completedHoleStatsRef.current = updatedStats;
    setHoles(updatedHoles);
    setCompletedHoleStats(updatedStats);
    const allHolesScored = hasAllHolesScored(updatedStats, updatedHoles);
    allHolesCheckpointedRef.current = allHolesScored;
    if (allHolesScored) {
      // If the player revises a finished scorecard before submitting, carry
      // the revised stats into the existing finish affordance.
      setPendingFinalStats(updatedStats);
    } else {
      // Reopening the final holed shot invalidates any stale completion prompt.
      setPendingFinalStats(null);
      setShowFinishConfirm(false);
    }
  }, []);

  const handleSaveShot = (shot: ShotRecord) => {
    if (completedHoleStats[currentHoleIndex]) {
      return;
    }

    allHolesCheckpointedRef.current = false;
    const currentInProgress = inProgressShotsByHoleRef.current;
    const existing = currentInProgress[currentHoleIndex] ?? [];
    const duplicateIndex = existing.findIndex((candidate) => candidate.shotNumber === shot.shotNumber);
    const updatedShots = duplicateIndex >= 0
      ? existing.map((candidate, index) => index === duplicateIndex ? shot : candidate)
      : [...existing, shot];
    const nextInProgress = { ...currentInProgress, [currentHoleIndex]: updatedShots };

    // Do not wait for React or the 15s autosave timer. Once a golfer records
    // a shot, its full round snapshot is synchronously recoverable before a
    // phone lock, app switch, crash, or connectivity drop can interrupt it.
    inProgressShotsByHoleRef.current = nextInProgress;
    emergencySave({
      playerId,
      roundId,
      timestamp: Date.now(),
      setupData,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: nextInProgress,
      currentHoleIndex,
    });
    setInProgressShotsByHole(nextInProgress);
  };

  /**
   * Auto-save handler for shot tracking - persists to localStorage + server.
   *
   * The emergency snapshot is the immediate local fallback. The legacy v1
   * IndexedDB bridge is deliberately reserved for a failed final submission
   * (persistFailedSubmission), where the shared v2 sync engine can recover it
   * non-destructively. Do not enqueue normal in-progress shots there.
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Skip auto-save entirely if the round has been submitted or is being submitted
    if (isSubmittingRef.current || completedRoundId) return;

    // Update the ref before React schedules its render. Recovery writes below
    // must include other in-progress holes too; a setState updater is not
    // guaranteed to execute before this synchronous snapshot is created.
    const hasCompletedHole = completedHoleStatsRef.current[holeIndex]?.score != null;
    const allInProgressShots = { ...inProgressShotsByHoleRef.current };
    if (hasCompletedHole) {
      delete allInProgressShots[holeIndex];
    } else {
      allInProgressShots[holeIndex] = shots;
    }
    inProgressShotsByHoleRef.current = allInProgressShots;
    setInProgressShotsByHole(allInProgressShots);

    // SYNCHRONOUS localStorage backup — always runs, always completes
    const emergencyTimestamp = Date.now();
    emergencySave({
      playerId,
      roundId,
      timestamp: emergencyTimestamp,
      setupData,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: allInProgressShots,
      currentHoleIndex: holeIndex,
    });

    // Background save to database — protects mid-hole shot data
    // Uses ref-based data to avoid stale closure, plus queue for concurrent saves
    if (navigator.onLine) {
      // Editing a completed hole persists the revised complete scorecard, not
      // a contradictory in-progress copy of that same hole.
      if (hasCompletedHole) {
        await persistCompletedHole(
          buildPartialRoundData(
            completedHoleStatsRef.current,
            activeProgressHoleRef.current,
            allInProgressShots,
          ),
          emergencyTimestamp,
          false,
        );
        return;
      }
      if (serverSaveInProgressRef.current) {
        // Queue this save — it will execute after the current one completes
        pendingServerSaveRef.current = { shots, holeIndex, emergencyTimestamp };
      } else {
        const executeServerSave = async (
          saveShots: ShotRecord[],
          saveHoleIndex: number,
          saveEmergencyTimestamp: number,
        ) => {
          serverSaveInProgressRef.current = true;
          try {
            const mergedInProgress = { ...inProgressShotsByHoleRef.current, [saveHoleIndex]: saveShots };
            const result = await savePartialRound(
              buildPartialRoundData(undefined, saveHoleIndex, mergedInProgress),
              liveRoundId()
            );
            if (result.success) {
              consecutiveSaveFailuresRef.current = 0;
              if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
              clearEmergencySaveThrough(roundId, playerId, saveEmergencyTimestamp);
            } else if (result.error === 'conflict') {
              void handleRoundSyncConflict('This round was updated on another device. Please reload.');
            } else if (result.error === 'busy' || result.error === 'retry') {
              // Single-flight skip — another save for this round holds the row
              // server-side; the next tick re-sends the full state. Not a failure.
            } else if (isCompletedRoundError(result.error)) {
              redirectToCompletedRound();
            } else if (result.error === 'round_missing') {
              // The row is gone. Re-create from this same snapshot instead of
              // counting a failure the player cannot act on.
              await recreateMissingRound(
                buildPartialRoundData(undefined, saveHoleIndex, mergedInProgress),
                saveEmergencyTimestamp,
              );
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
                    const r = await savePartialRound(pending.roundData!, liveRoundId());
                    if (r.success) {
                      consecutiveSaveFailuresRef.current = 0;
                      if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
                    } else if (r.error === 'conflict') {
                      void handleRoundSyncConflict('This round was updated on another device. Please reload.');
                    } else if (r.error === 'busy' || r.error === 'retry') {
                      // Single-flight skip, same as the primary save — not a failure.
                    } else if (isCompletedRoundError(r.error)) {
                      redirectToCompletedRound();
                    } else if (r.error === 'round_missing') {
                      await recreateMissingRound(
                        pending.roundData!,
                        pending.emergencyTimestamp ?? Date.now(),
                      );
                    }
                  } catch { /* non-critical */ } finally {
                    serverSaveInProgressRef.current = false;
                  }
                })();
              } else {
                void executeServerSave(
                  pending.shots,
                  pending.holeIndex,
                  pending.emergencyTimestamp ?? Date.now(),
                );
              }
            }
          }
        };
        void executeServerSave(shots, holeIndex, emergencyTimestamp);
      }
    }
  }, [
    buildPartialRoundData,
    completedRoundId,
    handleRoundSyncConflict,
    isCompletedRoundError,
    liveRoundId,
    persistCompletedHole,
    playerId,
    recreateMissingRound,
    redirectToCompletedRound,
    roundId,
    setupData,
    showAutoSaveWarning,
  ]);

  const handleRoundSubmit = async (
    allHoleStats: HoleStats[],
    qualifierRoundNumberOverride?: number,
  ) => {
    if (isSubmittingRef.current) return;
    const submitSetupData = qualifierRoundNumberOverride == null
      ? setupData
      : { ...setupData, qualifierRoundNumber: qualifierRoundNumberOverride };
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError('');
    // Clear any queued auto-save to prevent race conditions during submit
    pendingServerSaveRef.current = null;

    try {
      // Save pre-submit snapshot to localStorage as insurance
      emergencySave({
        playerId,
        roundId,
        timestamp: Date.now(),
        setupData: submitSetupData,
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
        courseName: submitSetupData.courseName,
        courseId: submitSetupData.courseId,
        teeId: submitSetupData.teeId,
        courseCity: submitSetupData.courseCity || undefined,
        courseState: submitSetupData.courseState || undefined,
        courseRating: submitSetupData.courseRating ? parseFloat(submitSetupData.courseRating) : undefined,
        courseSlope: submitSetupData.courseSlope ? parseInt(submitSetupData.courseSlope) : undefined,
        teesPlayed: submitSetupData.teesPlayed || undefined,
        roundType: submitSetupData.roundType,
        roundDate: submitSetupData.roundDate,
        holes: allHoleStats,
        qualifierId: submitSetupData.qualifierId,
        qualifierRoundNumber: submitSetupData.qualifierRoundNumber,
      };

      // A `round_missing` answer means the server PROVED this id has no row.
      // Re-submit the same payload as a NEW round — the no-id branch creates
      // and completes it in one atomic call — instead of throwing the key at
      // the overlay, which rendered the literal string "round_missing". A
      // failed re-create comes back as a sentence; the snapshot above stays.
      const { result } = await writeRoundRecreatingIfMissing(
        submitGolfRoundComprehensive,
        roundData,
        liveRoundId(),
      );
      if (!result.success) {
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
        throw new Error(result.error);
      }

      // Clean up IndexedDB draft data and emergency save for this round
      clearEmergencySave(roundId, playerId);
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
        await persistFailedSubmission(allHoleStats, submitSetupData);
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

  const requestRoundSubmission = async (allHoleStats: HoleStats[]) => {
    // Legacy rows created before qualifier_round_number became durable must
    // explicitly identify their configured result before the guarded terminal
    // submit. The choices came from the authenticated server page; do not
    // infer one from the scorecard or silently create a duplicate result.
    if (
      setupData.qualifierId
      && setupData.qualifierRoundNumber == null
      && selectedQualifierRoundNumber == null
    ) {
      setPendingFinalStats(allHoleStats);
      setShowFinishConfirm(false);
      setShowQualifierRoundNumberDialog(true);
      return;
    }

    await handleRoundSubmit(allHoleStats, selectedQualifierRoundNumber);
  };

  const handleSaveForLater = async () => {
    try {
      let result = await savePartialRound(buildPartialRoundData(), roundId);

      // 'busy' = an auto-save for this round is mid-flight server-side. This is
      // a user-initiated save, so don't fail it on a coalescing skip — wait for
      // the in-flight save to release the row and try once more.
      if (!result.success && (result.error === 'busy' || result.error === 'retry')) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        result = await savePartialRound(buildPartialRoundData(), roundId);
      }

      // A user-initiated save must not be the one that loses the round.
      if (!result.success && result.error === 'round_missing') {
        result = await savePartialRound(buildPartialRoundData(), undefined);
      }

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
        // Surface the action's OWN message. It distinguishes "this round can no
        // longer be discarded — already finished or removed" from a transient
        // failure, and the next line clears the local recovery snapshot
        // irreversibly, so "Please try again" is the wrong steer for the first
        // case. The other two callers of this action already do this.
        showToast?.(result.error || 'Failed to delete round. Please try again.', 'error');
        return;
      }
        clearEmergencySave(roundId, playerId);
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
      {/* Compact resume context. The scorecard owns live hole navigation, so this
          header stays focused on the course and durable progress rather than
          repeating a stale “starting hole” utility row. */}
      <div className={fairwayScope('bg-surface border-b border-border-subtle px-4 py-3')}>
        <div className="max-w-[720px] mx-auto flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-fw-md bg-accent-50 text-accent-700 ring-1 ring-accent-200">
            <svg className="h-5 w-5 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-tertiary">Continue round</p>
            <p className="truncate font-fw-display text-body-lg font-semibold tracking-[-0.012em] text-text-primary">
              {setupData.courseName}
            </p>
          </div>
          <div className="flex-shrink-0 rounded-fw-sm bg-surface-sunken px-2.5 py-1.5 text-right">
            <p className="font-fw-mono text-caption font-medium tabular-nums text-text-secondary">
              {completedHoleStats.filter(s => s != null).length}/{holes.length}
            </p>
            <p className="font-fw-sans text-microbadge uppercase tracking-wide text-text-tertiary">saved</p>
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
          isOnline={syncStatus.isOnline}
          isSyncing={syncStatus.isSyncing}
          pendingCount={syncStatus.pendingCount}
          lastSuccessfulSync={syncStatus.lastSuccessfulSync}
          syncError={syncStatus.syncError}
          onSyncNow={() => {
            void useOfflineSyncStore.getState().startSync();
          }}
          onRetrySync={() => {
            void useOfflineSyncStore.getState().retrySync();
          }}
          onDismissError={() => useOfflineSyncStore.getState().clearSyncError()}
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
          <FwButton
            variant="primary"
            size="sm"
            onClick={() => setShowFinishConfirm(true)}
            className="flex-shrink-0"
          >
            Submit Round
          </FwButton>
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
      <ModalShell
        open={Boolean(showRecoveryDialog && recoveryData)}
        onOpenChange={(next) => {
          if (!next) setShowRecoveryDialog(false);
        }}
        size="sm"
        title="Recover saved progress"
        hideTitle
        hideClose
      >
          <div className="px-6 pb-6 pt-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-fw-md bg-fw-warning-bg">
              <svg className="h-6 w-6 text-fw-warning-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="mb-2 text-center font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">
              Recover Unsaved Progress?
            </h2>
            <p className="mb-1 text-center font-fw-sans text-body-sm text-text-tertiary">
              Found locally saved data from{' '}
              {recoveryData ? (() => {
                const seconds = Math.floor((Date.now() - recoveryData.timestamp) / 1000);
                if (seconds < 60) return 'just now';
                if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
                return `${Math.floor(seconds / 3600)}h ago`;
              })() : ''}
            </p>
            <p className="mb-6 text-center font-fw-sans text-body-sm text-text-tertiary">
              {recoveryData?.completedHoleStats.filter(h => h != null).length ?? 0} completed holes found in local backup.
            </p>
            <div className="flex gap-3">
              <FwButton variant="secondary"
                onClick={() => {
                  clearEmergencySave(roundId, playerId);
                  setShowRecoveryDialog(false);
                  setRecoveryData(null);
                }}
                className="flex-1"
              >
                Discard
              </FwButton>
              <FwButton variant="primary"
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
                className="flex-1"
              >
                Restore
              </FwButton>
            </div>
          </div>
      </ModalShell>

      {/* A small number of legacy qualifier parents predate the durable round
          number. The scorecard stays saved; the player supplies one of the
          server-derived unused choices before the terminal guard fills it. */}
      <ModalShell
        open={showQualifierRoundNumberDialog}
        onOpenChange={(next) => {
          setShowQualifierRoundNumberDialog(next);
          if (!next && pendingFinalStats) setShowFinishConfirm(true);
        }}
        size="sm"
        title="Choose qualifier round"
      >
        <div className="px-6 pb-6 pt-2">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            This saved scorecard needs its qualifier round number before it can be submitted.
            Your shots and completed holes remain saved.
          </p>

          {qualifierRoundNumberOptions.length > 0 ? (
            <div className="mt-5 space-y-2" role="radiogroup" aria-label="Qualifier round number">
              {qualifierRoundNumberOptions.map((roundNumber) => {
                const selected = selectedQualifierRoundNumber === roundNumber;
                return (
                  <FwButton
                    key={roundNumber}
                    type="button"
                    variant={selected ? 'primary' : 'secondary'}
                    className="w-full justify-between"
                    aria-pressed={selected}
                    onClick={() => setSelectedQualifierRoundNumber(roundNumber)}
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      <span>Qualifier round {roundNumber}</span>
                      <span className="font-fw-mono text-body-sm">{selected ? 'Selected' : ''}</span>
                    </span>
                  </FwButton>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-fw-md bg-fw-warning-bg px-4 py-3 font-fw-sans text-body-sm text-fw-warning-ink">
              {qualifierRoundNumberUnavailableReason
                ?? 'No unused qualifier round is available right now. Your scorecard remains saved.'}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <FwButton
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setShowQualifierRoundNumberDialog(false);
                if (pendingFinalStats) setShowFinishConfirm(true);
              }}
            >
              Back
            </FwButton>
            <FwButton
              type="button"
              variant="primary"
              className="flex-1"
              disabled={selectedQualifierRoundNumber == null || !pendingFinalStats}
              onClick={() => {
                if (!pendingFinalStats || selectedQualifierRoundNumber == null) return;
                setShowQualifierRoundNumberDialog(false);
                void handleRoundSubmit(pendingFinalStats, selectedQualifierRoundNumber);
              }}
            >
              Submit Round
            </FwButton>
          </div>
        </div>
      </ModalShell>

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
          await requestRoundSubmission(pendingFinalStats);
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
          void requestRoundSubmission(pendingFinalStats);
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
