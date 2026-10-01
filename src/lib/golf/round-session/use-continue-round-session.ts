'use client';

import { startTransition, useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import { submitGolfRoundComprehensive, savePartialRound, deleteInProgressRound, type PartialRoundData } from '@/app/golf/actions/golf';
import { checkRoundStaleness, type TerminalRoundSubmissionData } from '@/app/golf/actions/round-drafts';
import { deleteOfflineRound, saveOfflineRound } from '@/lib/offline/indexed-db';
import { beaconPartialSave } from '@/lib/offline/partial-save-beacon';
import { recordHelmBreadcrumb } from '@/lib/observability/client-breadcrumbs';
import { getRoundRecoverySnapshot } from '@/lib/offline/shot-storage';
import { useOfflineSyncStatus } from '@/stores/offline-sync-store';
import {
  emergencySave,
  loadEmergencySave,
  clearEmergencySave,
  clearEmergencySaveThrough,
  isEmergencySaveCoveredByProgress,
  isEmergencySaveEquivalentToProgress,
  isRecoverableRoundSubmitError,
  markRoundDiscarded,
  migrateEmergencySave,
  wasRoundDiscarded,
  DISCARDED_ROUNDS_STORAGE_KEY,
  EMERGENCY_SAVE_DEGRADED_EVENT,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';
import { AutoSaveHeldError, isAutoSaveHeld } from '@/hooks/golf/use-shot-state-machine';
import { computeShotFingerprint } from '@/lib/utils/shot-helpers';
import {
  writeRoundRecreatingIfMissing,
  ROUND_CONFLICT_MESSAGE,
  describeRoundWriteResult,
  isQualifierClosedError,
} from '@/lib/golf/round-missing-recovery';
import { isUnreadableWriteFailure } from '@/lib/golf/round-write-outcome';
import { updateRoundType } from '@/app/golf/actions/round-type';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { useActiveWork } from '@/lib/recovery/use-active-work';
import { resolveRoundRoutes, type RoundSessionRoutes } from '@/lib/golf/round-session/routes';

export type Hole = RoundHole;

/**
 * Drop the v1 failed-submit entry queued for a discarded round, never failing
 * the discard: best effort, since the sync drain also skips a round marked
 * discarded on this device.
 */
function forgetQueuedRound(roundId: string): void {
  void Promise.resolve().then(() => deleteOfflineRound(roundId)).catch(() => {});
}

function hasAllHolesScored(holeStats: HoleStats[], roundHoles: Hole[]): boolean {
  return holeStats.length === roundHoles.length
    && roundHoles.every((_, index) => holeStats[index]?.score != null);
}

// B2: shown once a background poll or an explicit save `conflict` proves the
// server has moved past what this device last confirmed. The round-write
// RPCs are full-snapshot REPLACE keyed on `expectedUpdatedAt` as an
// optimistic lock; this device's in-memory holes/shots reflect the OLD
// state, so a reload — not a silent resync of the lock token — is the only
// safe way to keep writing. Sourced from round-missing-recovery.ts (B6) so
// this and `describeRoundWriteFailure('conflict')` never drift apart.
const ROUND_CONFLICT_RELOAD_MESSAGE = ROUND_CONFLICT_MESSAGE;

export interface RoundSetupData {
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


/** What the engine needs about the round: the server page's data for it. */
export interface ContinueRoundSessionProps {
  roundId: string;
  playerId: string;
  setupData: RoundSetupData;
  holes: Hole[];
  completedHoleStats: HoleStats[];
  startHoleIndex: number;
  initialShots?: HoleStats['shots'];
  initialShotNumber?: number;
  initialInProgressShotsByHole?: Record<number, ShotRecord[]>;
  serverDataTimestamp?: string;
}

/**
 * What the engine asks of the screen that draws it.
 *
 * Identity matters: `showToast` is a dependency of the conflict, auto-save-warning and re-create callbacks, so a new
 * function each render re-creates them each render. The legacy screen passes exactly that on purpose (`useToast()`
 * makes new functions per call, as the engine used to get them), so its behaviour is unchanged. A new renderer passes
 * a stable, module-level port and gets each callback made once. The continue screen never hides the mobile nav and
 * never ticks a haptic, so the engine has no ports for either.
 */
export interface ContinueRoundSessionPorts {
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => unknown;
}

/** What a screen may tell the continue engine beyond its ports; each omitted value is the Fairway screen's own. */
export interface ContinueRoundSessionOptions {
  ports: ContinueRoundSessionPorts;
  /** Where the engine sends the player. Read at call time, so passing a new object each render is safe. */
  routes?: Partial<RoundSessionRoutes>;
}

/**
 * The continue-round engine: resume tracking, autosave, recovery and submit for an in-progress round, without the
 * screen that draws it. Moved out of ContinueRoundClient unchanged (ROUNDS_PLAN step 5b), so a second renderer can
 * drive the same engine.
 */
export function useContinueRoundSession({
  roundId: routeRoundId,
  playerId,
  setupData,
  holes: initialHoles,
  completedHoleStats: initialCompletedStats,
  startHoleIndex,
  initialShots = [],
  initialShotNumber = 1,
  initialInProgressShotsByHole,
  serverDataTimestamp,
  ports,
  routes,
}: ContinueRoundSessionProps & ContinueRoundSessionOptions) {
  const router = useRouter();
  const { showToast } = ports;
  // Read at call time, never listed as a dependency: a screen that passes a new `routes` object each render must not
  // re-create the callbacks that list `router`.
  const routesRef = useRef(resolveRoundRoutes(routes));
  routesRef.current = resolveRoundRoutes(routes);
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

  // A02-001: an automatic stale-asset recovery replaces the whole document.
  // While there is entered hole data a reload would lose — or a submit whose
  // outcome is not known yet — this screen registers as dirty and the
  // recovery coordinator refuses to navigate. Same predicate as the
  // beforeunload guard below, plus the in-flight submit.
  useActiveWork(
    'golf-round-continue',
    submitting ||
      completedHoleStats.some((s) => s != null) ||
      Object.keys(inProgressShotsByHole).length > 0,
  );

  const [pendingFinalStats, setPendingFinalStats] = useState<HoleStats[] | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [completedRoundId, setCompletedRoundId] = useState<string | null>(null);
  // C3: the coach closed the qualifier this round targets between the
  // player finishing scoring and tapping submit. Distinct from a completed
  // round — this round is still `in_progress` and stays that way, so the
  // submit overlay offers a way OUT (reclassify to practice) instead of
  // "Retry submit", which would return the identical refusal forever.
  const [qualifierClosed, setQualifierClosed] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
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
  // B2: set once polling proves the server moved past this device's own
  // checkpoint, or a save comes back `conflict`. Every write entry point
  // (autosave, hole checkpoint, save-and-exit, submit) checks this and
  // refuses to write until the player reloads — a stale device must never
  // overwrite newer server holes.
  const roundConflictBlockedRef = useRef(false);
  // Mirrors roundConflictBlockedRef for rendering — a ref change alone does
  // not trigger a re-render, so the blocked banner needs this to appear.
  const [roundConflictBlocked, setRoundConflictBlocked] = useState(false);
  // B9: true while a write this device issued has an outcome it could not
  // read — a background beacon (no response by design) or a foreground save
  // the browser killed mid-flight (iOS "Load failed" on phone lock / app
  // switch). Such a write bumps the server's `updated_at` without telling
  // us the new value, so the next poll or save sees a mismatch that looks
  // exactly like another device writing. The next apparent staleness after
  // this is set is therefore this device's own write: the self-heal reads
  // the server's CURRENT `updated_at` and adopts it, which is correct no
  // matter how many unreadable writes landed in between. Cleared by that
  // heal; set again by the next unreadable write. See
  // src/lib/golf/round-write-outcome.ts for the full reasoning.
  const pendingUnreadableWriteRef = useRef(false);
  // One background beacon per hidden period: iOS fires BOTH
  // `visibilitychange: hidden` and `pagehide` when the app is backgrounded,
  // and the second beacon carries the same snapshot as the first — two
  // landings would bump `updated_at` twice for one self-heal. Reset when
  // the page is visible again.
  const beaconSentWhileHiddenRef = useRef(false);
  // C1: set synchronously in `handleDeleteRound`, BEFORE the delete call —
  // the race is a checkpoint/auto-save already in flight for this SAME
  // round id whose `round_missing` response lands after the delete. The
  // ONE shared re-create path (`recreateMissingRound`, below) and Save &
  // Exit's own inline recreate both check this before re-creating, so a
  // discard can never be resurrected. Cleared if the delete itself fails —
  // a failed discard means the round is still live. A plain ref is
  // sufficient: an in-flight promise's closure still sees this same ref
  // object after the component unmounts and navigates away.
  const roundDiscardedRef = useRef(false);
  // MASTER_BUG_REPORT_2026-09-02.md Part 1: the exit dialog's Save for later
  // (and Discard) navigate away with `router.push`, a client-side transition
  // that does not itself fire `beforeunload` — but `handleBeforeUnload`'s own
  // "unsaved changes" check below reads local hole-stat/in-progress-shot
  // state, not server sync state, so it stays true even the instant after a
  // successful save (the local state that made it true is still sitting in
  // React state). If a real unload event ever does coincide with that
  // navigation, the round has already been safely saved or intentionally
  // discarded — the warning would be a false positive. Set true BEFORE the
  // `router.push` in both handleSaveForLater and handleDeleteRound so
  // `handleBeforeUnload` bails out for exactly those two exits, and nothing
  // else — a genuinely unsaved close/refresh/back is untouched.
  const roundExitedSafelyRef = useRef(false);
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
  // R-2: while a device copy is offered and neither restored nor discarded,
  // an auto-save of the server's own shots must not overwrite or clear it.
  const recoveryDataRef = useRef(recoveryData);
  recoveryDataRef.current = recoveryData;
  // R-2: bumped by Restore. The shot tracker only re-reads its shots when the
  // hole changes, so a renderer keys it by this to load the restored shots on
  // the SAME hole (the common case: the phone locked mid-hole).
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  // The shots the server page loaded for a hole (finished or in progress).
  const serverShotsForHole = useCallback((holeIndex: number): ShotRecord[] => {
    const serverInProgress = initialInProgressShotsByHole
      ?? (initialShots.length > 0 ? { [startHoleIndex]: initialShots } : {});
    return initialCompletedStats[holeIndex]?.shots ?? serverInProgress[holeIndex] ?? [];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the server page's data, fixed for this mount
  }, []);
  // R-8: once the round is discarded or left, no timer writes its device copy back.
  const backupOnDevice = useCallback((data: EmergencySaveData): boolean => {
    if (roundDiscardedRef.current || roundExitedSafelyRef.current) return false;
    return emergencySave(data);
  }, []);
  // R-4: another tab on this device (the Library, a second round screen)
  // discarded this round; this screen must not re-create it.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DISCARDED_ROUNDS_STORAGE_KEY && wasRoundDiscarded(roundId, playerId)) {
        roundDiscardedRef.current = true;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [roundId, playerId]);

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
      router.replace(routesRef.current.round(roundId));
    });
  }, [roundId, router]);

  const isCompletedRoundError = useCallback((message?: string) => {
    if (typeof message !== 'string') {
      return false;
    }

    // C3: the qualifier-closed refusal ALSO contains "already been
    // completed" — about the QUALIFIER, not the round — and the round is
    // still `in_progress` when it fires. Treating it as "this round is
    // complete" redirects to the round's own detail page, which redirects
    // BACK here for an in_progress round: an infinite loop every time
    // submit is retried. Excluded here; `handleRoundSubmit` classifies it
    // separately via `isQualifierClosedError`.
    if (isQualifierClosedError(message)) {
      return false;
    }

    const normalizedMessage = message.toLowerCase();
    return normalizedMessage.includes('already been completed')
      || normalizedMessage.includes('already been submitted')
      || normalizedMessage.includes('may have already been completed')
      || normalizedMessage.includes('already completed');
  }, []);

  // B2: engage the write-block, and show the message once as a toast so a
  // repeated poll/retry tick that finds the round still blocked does not
  // spam the player — the persistent error banner already stays visible.
  const blockRoundForConflict = useCallback((message: string) => {
    const alreadyBlocked = roundConflictBlockedRef.current;
    roundConflictBlockedRef.current = true;
    setRoundConflictBlocked(true);
    setError(message);
    if (!alreadyBlocked) {
      showToast(message, 'error');
    }
  }, [showToast]);

  /**
   * `knownCurrentUpdatedAt` lets a caller that already fetched the server's
   * value (the status-sync poll) hand it straight through instead of this
   * function re-fetching it.
   *
   * Resolves `true` when the apparent conflict was this device's own
   * unreadable write (or a concurrent path already resolved it) and the lock
   * token now matches the server, so the caller may retry its write; `false`
   * when the round is now blocked (or was redirected as completed).
   */
  const handleRoundSyncConflict = useCallback(async (
    fallbackMessage: string,
    knownCurrentUpdatedAt?: string | null,
  ): Promise<boolean> => {
    // B9: a write this device issued but could not read the outcome of (a
    // beacon, or a save the browser killed mid-flight) is indistinguishable
    // from a genuine multi-device conflict until this next check. Treat the
    // next apparent conflict after one as self-caused: adopt the value and
    // resume normal saving, rather than escalating to a permanent
    // write-block on a single device that simply had its phone lock.
    if (pendingUnreadableWriteRef.current) {
      pendingUnreadableWriteRef.current = false;
      if (knownCurrentUpdatedAt) {
        lastServerUpdatedAtRef.current = knownCurrentUpdatedAt;
        return true;
      }
      try {
        const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
        if (stalenessResult.success) {
          if (stalenessResult.data.status === 'completed') {
            redirectToCompletedRound();
            return false;
          }
          if (stalenessResult.data.currentUpdatedAt) {
            lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt;
          }
        }
      } catch {
        // Nothing more to do — a real write attempt will surface a fresh
        // conflict (and re-enter this function) if this guess was wrong.
      }
      return true;
    }

    // The poll and a save can both be in flight with the same old token and
    // both observe the same self-caused mismatch; whichever resolves second
    // finds the token already adopted. Not a conflict.
    if (knownCurrentUpdatedAt && knownCurrentUpdatedAt === lastServerUpdatedAtRef.current) {
      return true;
    }

    try {
      const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
      // A genuine multi-device write collision. Do NOT adopt the server's
      // newer `updated_at` into `lastServerUpdatedAtRef` here (B2) — this
      // device's in-memory holes/shots still reflect the OLD state, so
      // resyncing the optimistic-lock token alone would let this device's
      // NEXT save pass the lock and silently overwrite whatever the other
      // device just wrote. Block further writes instead; only a reload
      // (which re-fetches the full round fresh) may resume saving.
      if (stalenessResult.success && stalenessResult.data.status === 'completed') {
        redirectToCompletedRound();
        return false;
      }
      // Same race as above, seen from the save side: the token was adopted
      // by a concurrent self-heal between this save's dispatch and its
      // `conflict` answer, and the server now agrees with it.
      if (stalenessResult.success && !stalenessResult.data.isStale) {
        return true;
      }
    } catch {
      // Fall through to the generic conflict message below.
    }

    blockRoundForConflict(fallbackMessage);
    return false;
  }, [blockRoundForConflict, redirectToCompletedRound, roundId]);

  /**
   * Every foreground `savePartialRound` goes through here so a call whose
   * outcome the browser lost (killed fetch on phone lock — see
   * round-write-outcome.ts) is recorded as a possibly-landed write under the
   * current token, exactly like a beacon, instead of being mistaken for
   * another device on the next check.
   */
  const savePartialRoundTracked = useCallback(async (
    data: PartialRoundData,
    targetRoundId: string | undefined,
  ) => {
    try {
      return await savePartialRound(data, targetRoundId);
    } catch (err) {
      if (isUnreadableWriteFailure(err)) pendingUnreadableWriteRef.current = true;
      throw err;
    }
  }, []);

  // Throttle auto-save warning to at most once per 60s to avoid toast spam
  const showAutoSaveWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoSaveWarningRef.current < 60_000) return;
    lastAutoSaveWarningRef.current = now;
    showToast('Auto-save is having trouble. Your data is cached locally.', 'warning');
  }, [showToast]);

  // C5: `emergencySave` fires this at most once per session when the
  // synchronous localStorage backup has failed (full or unavailable) even
  // after compacting old saves — 13 call sites across both round screens
  // never checked its boolean return, so this was previously silent. The
  // independent IndexedDB mirror still runs regardless; this is specifically
  // about the FAST path being down.
  useEffect(() => {
    const handleEmergencySaveDegraded = () => {
      showToast(
        'This device could not save a quick local backup of your shots. They are still being saved to a slower backup and to the server.',
        'warning',
      );
    };
    window.addEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, handleEmergencySaveDegraded);
    return () => window.removeEventListener(EMERGENCY_SAVE_DEGRADED_EVENT, handleEmergencySaveDegraded);
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
    // B2: the hook already refuses to adopt a newer server updated_at once
    // it proves this device is behind — routed through the same
    // conflict/self-heal decision (B9) an explicit save `conflict` uses,
    // rather than blocking unconditionally on every polling staleness.
    onRoundStale: ({ currentUpdatedAt }) => {
      void handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE, currentUpdatedAt);
    },
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

    // A server newer than the copy retires it only when the server also holds
    // every hole and shot the copy has (R-7): the device clock against
    // `updated_at` cannot prove that on its own.
    if (serverDataTimestamp) {
      const serverTime = new Date(serverDataTimestamp).getTime();
      if (emergencyData.timestamp <= serverTime && isEmergencySaveCoveredByProgress(emergencyData, {
        holes: initialHoles,
        completedHoleStats: initialCompletedStats,
        inProgressShotsByHole: serverInProgress,
      })) {
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
      // B2: a reload is exactly the action the blocked banner asks for.
      // Warning "you have unsaved changes" here would fight that instruction
      // on every reload attempt, including the browser's own F5.
      if (roundConflictBlockedRef.current) return;
      // Save for later / Discard already resolved this round's fate on the
      // server before navigating away — see roundExitedSafelyRef above.
      if (roundExitedSafelyRef.current) return;
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
      // Skip after Save for later / Discard: for Discard specifically, a
      // beacon fired here (pagehide can follow router.push during the same
      // navigation) would re-write the round the player just deleted —
      // resurrecting it. For Save for later it would just be a redundant
      // write of data already durable server-side.
      if (roundExitedSafelyRef.current) return;

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
      // B2: a device PROVEN behind must not write — and the beacon holds no
      // lock token (see below), so this return is the only thing stopping it.
      if (roundConflictBlockedRef.current) return;
      // iOS fires visibilitychange-hidden AND pagehide for one backgrounding;
      // the snapshot cannot change while hidden, so one beacon covers both.
      if (beaconSentWhileHiddenRef.current) return;

      const inProgressArr = Object.entries(mergedInProgress)
        .filter(([, shots]) => shots.length > 0)
        .map(([idx, shots]) => ({
          holeNumber: holesSnapshot[Number(idx)]?.number ?? Number(idx) + 1,
          shots,
        }));
      const saveData: PartialRoundData = {
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
        // Deliberately NO `expectedUpdatedAt`: a beacon has no reader, so a
        // lock rejection would silently drop the last shots before a phone
        // lock — the 2026-06-10 lost-round failure mode. The token this
        // device holds is stale precisely after its own earlier unreadable
        // write (until the next poll heals it), so a locked beacon would be
        // refused exactly when it matters. A device PROVEN behind is kept
        // from writing by the `roundConflictBlockedRef` return above.
      };
      // Unload-safe delivery — see new-round-client: a plain server-action fetch
      // is killed on page freeze, so sendBeacon guarantees the in-progress round
      // reaches the server and stays resumable.
      if (beaconPartialSave(saveData, roundId)) {
        beaconSentWhileHiddenRef.current = true;
        // B9: this write's response is unreadable — see pendingUnreadableWriteRef above.
        pendingUnreadableWriteRef.current = true;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handlePageHide();
      } else {
        beaconSentWhileHiddenRef.current = false;
      }
    };
    const handlePageShow = () => {
      beaconSentWhileHiddenRef.current = false;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // pagehide fires on iOS when switching apps — more reliable than visibilitychange
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
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
    // C1: the delete landed while this save was in flight — re-creating now
    // would resurrect the round the player just discarded. R-4: or another
    // tab on this device (the Library, a second round screen) discarded it.
    if (roundDiscardedRef.current || wasRoundDiscarded(staleRoundId, playerId)) return false;
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
    router.replace(routesRef.current.continueRound(recreated.data.roundId));
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
    // B2: a prior conflict/staleness already proved this device is behind.
    // Writing this checkpoint would replace the round with this device's
    // outdated snapshot — refuse until the player reloads.
    if (roundConflictBlockedRef.current) {
      if (surfaceFailure) setError(ROUND_CONFLICT_RELOAD_MESSAGE);
      return false;
    }

    pendingServerSaveRef.current = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const waitDeadline = Date.now() + 10_000;
      while (serverSaveInProgressRef.current && Date.now() < waitDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (serverSaveInProgressRef.current) break;

      serverSaveInProgressRef.current = true;
      try {
        // Always the LIVE token: `saveData` captured it at build time, and a
        // self-healed conflict (below) or a recreate refreshes it mid-loop.
        const result = await savePartialRoundTracked(
          { ...saveData, expectedUpdatedAt: lastServerUpdatedAtRef.current },
          liveRoundId(),
        );
        if (result.success) {
          consecutiveSaveFailuresRef.current = 0;
          if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
          clearEmergencySaveThrough(roundId, playerId, emergencyTimestamp);
          return true;
        }
        if (result.error === 'conflict') {
          // B9: our own unreadable write moved the row — the token is
          // adopted, so re-send this same checkpoint under it.
          if (await handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE)) continue;
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
        // B5: not a transient failure — the identical payload will keep
        // failing until the flagged hole/field is fixed, so retrying (the
        // loop below) is pointless and the generic "keep this screen open
        // and try again" fallback actively misleads. Surface the specific
        // sentence immediately and never mark this hole checkpointed.
        if (result.error === 'hole_invalid') {
          setError(describeRoundWriteResult(result));
          return false;
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
    savePartialRoundTracked,
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
    // R-8: a discarded or left round gets no device copy back.
    if (roundDiscardedRef.current || roundExitedSafelyRef.current) return;

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
    // R-8: after Discard or Save for later nothing is written, not even the
    // device copy a debounce or retry timer would otherwise bring back.
    if (roundDiscardedRef.current || roundExitedSafelyRef.current) {
      throw new AutoSaveHeldError('discarded', false);
    }
    // R-2: an offered device copy is still undecided, and these are the
    // server's own shots for this hole (the tracker's first save after
    // mount). The server already has them; writing a device copy of them
    // would replace the offered one, and the ack would clear it.
    if (recoveryDataRef.current && computeShotFingerprint(shots) === computeShotFingerprint(serverShotsForHole(holeIndex))) {
      return;
    }

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
    const onDevice = backupOnDevice({
      playerId,
      roundId,
      timestamp: emergencyTimestamp,
      setupData,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: allInProgressShots,
      currentHoleIndex: holeIndex,
    });

    // B2: a prior conflict/staleness already proved this device is behind
    // the server. The localStorage backup above still ran (never lose local
    // progress), but writing to the server now would replace the round with
    // this device's outdated in-memory snapshot — refuse until reload.
    // R-1: every early return below that did not reach the server throws
    // AutoSaveHeldError, so the tracker says "on this device", not "saved",
    // and sends the same shots again.
    if (roundConflictBlockedRef.current) throw new AutoSaveHeldError('blocked', onDevice);

    // Background save to database — protects mid-hole shot data.
    // Uses ref-based data to avoid stale closure, plus queue for concurrent saves.
    if (!navigator.onLine) throw new AutoSaveHeldError('offline', onDevice);

    // Editing a completed hole persists the revised complete scorecard, not
    // a contradictory in-progress copy of that same hole. This checkpoint
    // already awaits and carries its own bounded retry loop
    // (`persistCompletedHole`) with its own hole-specific error UI — leave
    // it on that separate path rather than folding it into the circuit
    // breaker below (B3: "keep hole checkpoints separate").
    if (hasCompletedHole) {
      const checkpointed = await persistCompletedHole(
        buildPartialRoundData(
          completedHoleStatsRef.current,
          activeProgressHoleRef.current,
          allInProgressShots,
        ),
        emergencyTimestamp,
        false,
      );
      // Its own retry loop already ran; held, not a breaker failure (B3).
      if (!checkpointed) throw new AutoSaveHeldError(roundConflictBlockedRef.current ? 'blocked' : 'busy', onDevice);
      return;
    }

    if (serverSaveInProgressRef.current) {
      // Queue this save — it will execute (fire-and-forget) once the
      // in-flight primary save below releases the lock. Not a failure, but
      // not a server acknowledgement either (R-1): held, and re-sent.
      pendingServerSaveRef.current = { shots, holeIndex, emergencyTimestamp };
      throw new AutoSaveHeldError('queued', onDevice);
    }

    // Server save — AWAITED (B3) so `useShotStateMachine`'s auto-save effect
    // can see a rejected promise and run its retry/backoff and circuit
    // breaker. The previous fire-and-forget dispatch of the network save here resolved
    // `handleAutoSave`'s own promise immediately, before the network
    // round-trip even started, so the hook always saw success and always
    // showed "Saved" — the retry path never engaged. The localStorage
    // backup above already succeeded, so rethrowing a real failure is safe.
    serverSaveInProgressRef.current = true;
    try {
      const mergedInProgress = { ...inProgressShotsByHoleRef.current, [holeIndex]: shots };
      const result = await savePartialRoundTracked(
        buildPartialRoundData(undefined, holeIndex, mergedInProgress),
        liveRoundId()
      );
      if (result.success) {
        consecutiveSaveFailuresRef.current = 0;
        if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
        clearEmergencySaveThrough(roundId, playerId, emergencyTimestamp);
      } else if (result.error === 'conflict') {
        // A self-healed conflict needs no retry here: the next auto-save
        // tick re-sends the full state under the adopted token.
        void handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE);
      } else if (result.error === 'busy' || result.error === 'retry') {
        // Single-flight skip — another save for this round holds the row
        // server-side. Not a failure; held, so the tracker re-sends it.
        throw new AutoSaveHeldError('busy', onDevice);
      } else if (isCompletedRoundError(result.error)) {
        redirectToCompletedRound();
      } else if (result.error === 'round_missing') {
        // The row is gone. Re-create from this same snapshot instead of
        // counting a failure the player cannot act on if it succeeds; a
        // failed re-create falls through to the same unrecognized-failure
        // handling below so the breaker still engages.
        const recreated = await recreateMissingRound(
          buildPartialRoundData(undefined, holeIndex, mergedInProgress),
          emergencyTimestamp,
          false,
        );
        if (!recreated) {
          throw new Error('Auto-save could not re-create the round');
        }
      } else if (result.error === 'hole_invalid') {
        // B5: not a transient network failure — the identical payload will
        // keep failing until the flagged hole/field is fixed, so this must
        // not throw into the circuit breaker (which exists for outages, and
        // would keep retrying a failure retrying can never clear). Surface
        // the specific sentence immediately instead.
        setError(describeRoundWriteResult(result));
        throw new AutoSaveHeldError('invalid', onDevice);
      } else {
        // Throw so the hook's circuit breaker can track this failure.
        throw new Error(`Auto-save server error: ${result.error}`);
      }
    } catch (err) {
      // A held save is not a failure: no count, no warning.
      if (isAutoSaveHeld(err)) throw err;
      consecutiveSaveFailuresRef.current++;
      if (consecutiveSaveFailuresRef.current >= 2) {
        showAutoSaveWarning();
      }
      // Re-throw so `useShotStateMachine` sees a rejected promise (B3).
      throw err;
    } finally {
      serverSaveInProgressRef.current = false;
      // If a newer save was queued while we were saving, fire-and-forget it.
      // This is a queued follow-up, not the primary save the hook is
      // tracking, so its own failure must not reject handleAutoSave's promise.
      const pending = pendingServerSaveRef.current;
      if (pending) {
        pendingServerSaveRef.current = null;
        void (async () => {
          serverSaveInProgressRef.current = true;
          try {
            const mergedPending = { ...inProgressShotsByHoleRef.current, [pending.holeIndex]: pending.shots };
            const r = await savePartialRoundTracked(
              buildPartialRoundData(undefined, pending.holeIndex, mergedPending),
              liveRoundId()
            );
            if (r.success) {
              consecutiveSaveFailuresRef.current = 0;
              if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
              clearEmergencySaveThrough(roundId, playerId, pending.emergencyTimestamp ?? Date.now());
            } else if (r.error === 'busy' || r.error === 'retry') {
              // Single-flight skip, same as the primary save — not a failure.
            } else if (r.error === 'conflict') {
              void handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE);
            } else if (isCompletedRoundError(r.error)) {
              redirectToCompletedRound();
            } else if (r.error === 'round_missing') {
              await recreateMissingRound(
                buildPartialRoundData(undefined, pending.holeIndex, mergedPending),
                pending.emergencyTimestamp ?? Date.now(),
                false,
              );
            }
          } catch { /* queued save failure — non-critical, the primary save above is what the breaker tracks */ } finally {
            serverSaveInProgressRef.current = false;
          }
        })();
      }
    }
  }, [
    backupOnDevice,
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
    savePartialRoundTracked,
    serverShotsForHole,
    setupData,
    showAutoSaveWarning,
  ]);

  const handleRoundSubmit = async (
    allHoleStats: HoleStats[],
    qualifierRoundNumberOverride?: number,
  ) => {
    if (isSubmittingRef.current) return;
    // B2: never let a submit from a device already proven behind the server
    // replace the round with this device's outdated scorecard.
    if (roundConflictBlockedRef.current) {
      setError(ROUND_CONFLICT_RELOAD_MESSAGE);
      return;
    }
    const submitSetupData = qualifierRoundNumberOverride == null
      ? setupData
      : { ...setupData, qualifierRoundNumber: qualifierRoundNumberOverride };
    isSubmittingRef.current = true;
    setSubmitting(true);
    setError('');
    setQualifierClosed(false);
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
            if (stalenessResult.data.status === 'completed') {
              redirectToCompletedRound();
              return;
            }
            // B2/B9: the same self-heal-or-block decision every other write
            // uses. The token is adopted only when the mismatch was this
            // device's own unreadable write; a genuine conflict blocks —
            // never adopt first and bail second, which would let the next
            // auto-save pass the lock with this device's stale scorecard.
            if (stalenessResult.data.isStale) {
              const healed = await handleRoundSyncConflict(
                ROUND_CONFLICT_RELOAD_MESSAGE,
                stalenessResult.data.currentUpdatedAt,
              );
              if (!healed) {
                isSubmittingRef.current = false;
                setSubmitting(false);
                return;
              }
            } else if (stalenessResult.data.currentUpdatedAt) {
              lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt;
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
        // C3: distinguish the qualifier-closed refusal from the round itself
        // being complete BEFORE the (now-narrowed) completed-round check —
        // the round stays `in_progress`, so redirecting to its detail page
        // would bounce straight back here. Surface a terminal message and a
        // real way out (reclassify to practice) instead of looping.
        if (isQualifierClosedError(result.error)) {
          setQualifierClosed(true);
          setError(result.error);
          isSubmittingRef.current = false;
          // Stay in `submitting` so the overlay shows the message + action.
          return;
        }
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
      recordHelmBreadcrumb('golf.round', 'submit', { action: 'submit', result: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit round';
      if (isRecoverableRoundSubmitError(message)) {
        await persistFailedSubmission(allHoleStats, submitSetupData);
        isSubmittingRef.current = false;
        setSubmitting(false);
        setError('');
        showToast('Round saved on this device. Opening recovery flow.', 'warning');
        startTransition(() => {
          router.push(routesRef.current.recover);
        });
        return;
      }

      setError(message);
      isSubmittingRef.current = false;
      // Stay in submitting state so the overlay shows the error
    }
  };

  /**
   * C3: the existing reclassify path (`updateRoundType` /
   * `reclassify_golf_round`, `src/app/golf/actions/round-type.ts`) already
   * supports an `in_progress` round — it was extended to do exactly that on
   * 2026-08-30 — it just had no client entry point while a round was still
   * being tracked. Converting to 'practice' clears `qualifier_id` /
   * `qualifier_round_number` server-side without touching `status`, so the
   * round can then be submitted normally.
   *
   * `setupData` here is a PROP from the server page that loaded this round,
   * not local state — there is nothing to update client-side to reflect the
   * new type. Reload rather than trying to patch it in memory and resubmit:
   * that would mean calling `handleRoundSubmit` from inside THIS closure with
   * data this closure never had, the exact stale-closure shape that produced
   * the recorded `ReferenceError: round is not defined` in `savePartialRound`
   * (see round-missing-recovery.ts / shot-tracking.md, B9). A fresh page load
   * re-fetches the round as `practice` and the player taps the same submit
   * control they already know.
   */
  const handleSaveAsPractice = async () => {
    if (reclassifying) return;
    setReclassifying(true);
    try {
      const result = await updateRoundType({ roundId, roundType: 'practice' });
      if (!result.success) {
        showToast(result.error || 'Could not change this round to practice. Please try again.', 'error');
        return;
      }
      showToast('Saved as a practice round. Reloading…', 'success');
      window.location.reload();
    } catch {
      showToast('Could not change this round to practice. Please try again.', 'error');
    } finally {
      setReclassifying(false);
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
    // B2: a user-initiated "Save & Exit" must not be the write that overwrites
    // another device's newer holes, either.
    if (roundConflictBlockedRef.current) {
      showToast(ROUND_CONFLICT_RELOAD_MESSAGE, 'error');
      return;
    }
    try {
      let result = await savePartialRoundTracked(buildPartialRoundData(), roundId);

      // 'busy' = an auto-save for this round is mid-flight server-side. This is
      // a user-initiated save, so don't fail it on a coalescing skip — wait for
      // the in-flight save to release the row and try once more.
      if (!result.success && (result.error === 'busy' || result.error === 'retry')) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        result = await savePartialRoundTracked(buildPartialRoundData(), roundId);
      }

      // B9: a self-healed conflict (our own unreadable write moved the row)
      // adopts the token — re-send once under it. A genuine conflict blocks
      // and returns below.
      if (!result.success && result.error === 'conflict') {
        if (await handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE)) {
          result = await savePartialRoundTracked(buildPartialRoundData(), roundId);
        }
      }

      // A user-initiated save must not be the one that loses the round.
      // C1: unless the player discarded this exact round moments ago (Save &
      // Exit and Discard are two buttons in the same exit dialog) — in that
      // case re-creating would resurrect it.
      if (!result.success && result.error === 'round_missing' && !roundDiscardedRef.current && !wasRoundDiscarded(roundId, playerId)) {
        result = await savePartialRoundTracked(buildPartialRoundData(), undefined);
      }

      if (!result.success) {
        if (result.error === 'conflict') {
          await handleRoundSyncConflict(ROUND_CONFLICT_RELOAD_MESSAGE);
          return;
        }
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
        // B6: one helper turns every remaining round-write failure —
        // including hole_invalid's bare-key-plus-message shape — into a
        // player sentence, instead of a raw signal key reaching the toast.
        showToast(describeRoundWriteResult(result), 'error');
        return;
      }

      setShowExitModal(false);
      // Round is durable server-side as of the successful save above — an
      // unload/pagehide that coincides with this navigation must not warn or
      // re-save. Set before router.push (async; the listeners stay live
      // until the component actually unmounts).
      roundExitedSafelyRef.current = true;
      router.push(routesRef.current.library);
    } catch {
      showToast('Failed to save round. Please try again.', 'error');
    }
  };

  const completedStatsForHole = completedHoleStats[currentHoleIndex];
  const inProgressShots = inProgressShotsByHole[currentHoleIndex] ?? [];
  const activeHoleShots = completedStatsForHole?.shots ?? inProgressShots;
  const activeShotNumber = activeHoleShots.length > 0 ? activeHoleShots.length + 1 : initialShotNumber;

  const handleDeleteRound = async () => {
    // C1: mark BEFORE the delete call, not after it resolves — the window
    // this closes is between the delete request landing and any concurrent
    // save's response, so marking after would already be too late for the
    // race it exists to prevent.
    roundDiscardedRef.current = true;
    try {
      const result = await deleteInProgressRound(roundId);
      if (result && 'success' in result && !result.success) {
        // The round is still live — a later round_missing for it is a real
        // anomaly, not this race, so re-creating should still be allowed.
        roundDiscardedRef.current = false;
        // Surface the action's OWN message. It distinguishes "this round can no
        // longer be discarded — already finished or removed" from a transient
        // failure, and the next line clears the local recovery snapshot
        // irreversibly, so "Please try again" is the wrong steer for the first
        // case. The other two callers of this action already do this.
        showToast?.(result.error || 'Failed to delete round. Please try again.', 'error');
        return;
      }
      clearEmergencySave(roundId, playerId);
      // R-4/R-10: no other tab may re-create it, and a failed-submit entry
      // queued for it must not sync it back.
      markRoundDiscarded(roundId, playerId);
      forgetQueuedRound(roundId);
      setShowExitModal(false);
      // The round is gone server-side — nothing left to warn about or
      // re-save on a coincident unload/pagehide. Same reasoning as
      // handleSaveForLater above.
      roundExitedSafelyRef.current = true;
      router.push(routesRef.current.library);
    } catch {
      roundDiscardedRef.current = false;
      showToast?.('Failed to delete round. Please try again.', 'error');
    }
  };

  // Screen handlers that were inline in ContinueRoundClient: session logic (refs, submit flags, the restore of a
  // device snapshot) a second renderer would otherwise copy (ROUNDS_PLAN step 5c). Moved verbatim.

  // The device-snapshot recovery dialog.
  const handleDiscardRecovery = () => {
    clearEmergencySave(roundId, playerId);
    setShowRecoveryDialog(false);
    setRecoveryData(null);
    recoveryDataRef.current = null;
  };
  const handleRestoreRecovery = () => {
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
    // R-9: a restored copy with every hole scored is ready to submit, as the
    // mount check offers for a server round with every hole scored.
    const restoredHoles = recoveryData.holes && recoveryData.holes.length > 0 ? recoveryData.holes : holesRef.current;
    const restoredStats = recoveryData.completedHoleStats ?? completedHoleStatsRef.current;
    if (hasAllHolesScored(restoredStats, restoredHoles)) {
      setPendingFinalStats(restoredStats);
      setShowFinishConfirm(true);
    }
    setRestoreEpoch((epoch) => epoch + 1);
    setShowRecoveryDialog(false);
    setRecoveryData(null);
    recoveryDataRef.current = null;
    // Don't clear emergency save yet — will be cleared after next successful server save
  };

  // The dialog that asks a legacy qualifier row for its round number before the guarded submit.
  const handleQualifierRoundDialogChange = (next: boolean) => {
    setShowQualifierRoundNumberDialog(next);
    if (!next && pendingFinalStats) setShowFinishConfirm(true);
  };
  const handleQualifierRoundBack = () => {
    setShowQualifierRoundNumberDialog(false);
    if (pendingFinalStats) setShowFinishConfirm(true);
  };
  const handleQualifierRoundSubmit = () => {
    if (!pendingFinalStats || selectedQualifierRoundNumber == null) return;
    setShowQualifierRoundNumberDialog(false);
    void handleRoundSubmit(pendingFinalStats, selectedQualifierRoundNumber);
  };

  // The submit overlay's actions. Each one clears the submit flag the overlay's screen was holding, so no renderer
  // has to know `isSubmittingRef` exists.
  const handleSubmitGoBack = () => {
    setSubmitting(false);
    setError('');
    setQualifierClosed(false);
    isSubmittingRef.current = false;
    // Always re-show the finish confirm so user can submit again
    if (pendingFinalStats) {
      setShowFinishConfirm(true);
    }
  };
  const handleSubmitRetry = () => {
    setError('');
    isSubmittingRef.current = false;
    if (pendingFinalStats) void requestRoundSubmission(pendingFinalStats);
  };
  const handleSubmitSaveAndExit = async () => {
    setError('');
    isSubmittingRef.current = false;
    setSubmitting(false);
    await handleSaveForLater();
  };
  const handleSubmitDiscard = async () => {
    setError('');
    isSubmittingRef.current = false;
    setSubmitting(false);
    await handleDeleteRound();
  };

  return {
    roundId,
    syncStatus,
    currentHoleIndex,
    setCurrentHoleIndex,
    holes,
    setHoles,
    completedHoleStats,
    setCompletedHoleStats,
    error,
    setError,
    submitting,
    setSubmitting,
    showExitModal,
    setShowExitModal,
    inProgressShotsByHole,
    setInProgressShotsByHole,
    pendingFinalStats,
    showFinishConfirm,
    setShowFinishConfirm,
    completedRoundId,
    qualifierClosed,
    setQualifierClosed,
    selectedQualifierRoundNumber,
    setSelectedQualifierRoundNumber,
    showQualifierRoundNumberDialog,
    setShowQualifierRoundNumberDialog,
    isSubmittingRef,
    roundConflictBlocked,
    activeProgressHoleRef,
    showRecoveryDialog,
    setShowRecoveryDialog,
    recoveryData,
    setRecoveryData,
    handleHoleComplete,
    handleHoleStatsUpdate,
    handleSaveShot,
    handleAutoSave,
    handleRoundSubmit,
    handleSaveAsPractice,
    requestRoundSubmission,
    handleSaveForLater,
    activeHoleShots,
    activeShotNumber,
    handleDeleteRound,
    handleDiscardRecovery,
    handleRestoreRecovery,
    restoreEpoch,
    handleQualifierRoundDialogChange,
    handleQualifierRoundBack,
    handleQualifierRoundSubmit,
    handleSubmitGoBack,
    handleSubmitRetry,
    handleSubmitSaveAndExit,
    handleSubmitDiscard,
  };
}
