'use client';

import { startTransition, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { HoleStats, ShotRecord, RoundHole } from '@/lib/types/golf';
import {
  submitGolfRoundComprehensive,
  savePartialRound,
  deleteInProgressRound,
  getPlayerQualifiers,
  getNextQualifierRoundNumber,
  getPlayerSavedCourses,
  getRecentCoursesForPlayer,
  savePlayerCourse,
  touchSavedCourse,
  type PlayerQualifierInfo,
  type SavedCourse,
  type SavedCourseHoleConfig,
  type RecentPlayedCourse,
  type PartialRoundData,
} from '@/app/golf/actions/golf';
import { contributeCourseFromRound, type TeeRoundDefaults } from '@/app/golf/actions/course-library';
import { checkRoundStaleness, type TerminalRoundSubmissionData } from '@/app/golf/actions/round-drafts';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { useOfflineSyncStore, useOfflineSyncStatus } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { deleteOfflineRound, saveOfflineRound } from '@/lib/offline/indexed-db';
import { beaconPartialSave } from '@/lib/offline/partial-save-beacon';
import type { HoleConfig } from '@/lib/types/golf-course';
import {
  emergencySave,
  loadLatestEmergencySave,
  clearEmergencySave,
  clearEmergencySaveThrough,
  isRecoverableRoundSubmitError,
  markRoundDiscarded,
  migrateEmergencySave,
  wasRoundDiscarded,
  DISCARDED_ROUNDS_STORAGE_KEY,
  EMERGENCY_SAVE_DEGRADED_EVENT,
  type EmergencySaveData,
} from '@/lib/utils/emergency-save';
import { AutoSaveHeldError, isAutoSaveHeld } from '@/hooks/golf/use-shot-state-machine';
import { describeRoundWriteFailure, describeRoundWriteResult, writeRoundRecreatingIfMissing, isQualifierClosedError } from '@/lib/golf/round-missing-recovery';
import { isUnreadableWriteFailure } from '@/lib/golf/round-write-outcome';
import { updateRoundType } from '@/app/golf/actions/round-type';
import { getRoundRecoverySnapshots } from '@/lib/offline/shot-storage';
import { localDayIso } from '@/lib/golf/local-day';
import { useActiveWork } from '@/lib/recovery/use-active-work';
import { logError, isStaleServerActionError, softReloadForStaleServerAction } from '@/lib/error-logging';
import { clearPendingTeePick, loadPendingTeePick, savePendingTeePick } from '@/lib/golf/new-round-pick-cache';
import { reportRoundSetupRestoredAfterReload } from '@/lib/golf/new-round-setup-restore-signal';
import { reportDuplicateCompletedRoundWarned, reportRoundStartValidationBlocked } from '@/lib/golf/round-start-guard-signal';
import {
  LEGACY_NEW_ROUND_LOG_SOURCE,
  resolveRoundRoutes,
  type RoundSessionLogSource,
  type RoundSessionRoutes,
} from '@/lib/golf/round-session/routes';
import { CONFLICT_CHECK_TIMEOUT_MS, settleWithin } from '@/lib/golf/round-session/settle-within';
import {
  validateStartForm,
  validateStartHoles,
  type NewRoundSetup,
  type NewRoundStartForm,
  type NewRoundStartResult,
  type RoundSetupForm,
} from '@/lib/golf/round-session/start-form';

// What a round starts from, its result and the rules that gate it live in a plain module (no 'use client') so
// setup screens and server code can import them without the hook; the engine keeps exporting them.
export {
  validateStartForm,
  validateStartHoles,
  type NewRoundSetup,
  type NewRoundStartFailureReason,
  type NewRoundStartForm,
  type NewRoundStartResult,
  type RoundSetupForm,
} from '@/lib/golf/round-session/start-form';

export type Hole = RoundHole;

/** What handleHoleComplete should do immediately after recording/editing a hole's score. */
export type PostHoleCompleteAction =
  | { type: 'finish' }
  | { type: 'return-to-frontier' }
  | { type: 'advance'; nextHoleIndex: number };

/**
 * Pure decision logic for handleHoleComplete's post-save navigation —
 * exported for unit testing. Mirrors continue-round-client.tsx's identical
 * `allHolesScored` gate inside the `isReEdit` branch (P1 fix, production-
 * readiness mission 2026-07-09): re-editing a completed hole that turns out
 * to be the LAST unscored hole in the round must surface the finish
 * confirmation with the freshly-updated stats, not silently return to the
 * active frontier with a stale scorecard and no path to submit.
 */
export function decidePostHoleCompleteAction(params: {
  allHolesScored: boolean;
  isReEdit: boolean;
  holeIndex: number;
  totalHoles: number;
}): PostHoleCompleteAction {
  const { allHolesScored, isReEdit, holeIndex, totalHoles } = params;

  // Last hole (re-)completed and all holes scored — always show finish confirmation.
  if (allHolesScored && holeIndex === totalHoles - 1) {
    return { type: 'finish' };
  }
  if (isReEdit) {
    // All holes scored after re-edit — show finish confirmation.
    if (allHolesScored) return { type: 'finish' };
    // Re-editing a previously completed hole — return to the active frontier.
    return { type: 'return-to-frontier' };
  }
  if (holeIndex < totalHoles - 1) {
    // Normal progression — advance to next hole.
    return { type: 'advance', nextHoleIndex: holeIndex + 1 };
  }
  // Last hole completed for the first time — show finish confirmation.
  return { type: 'finish' };
}

export interface NewRoundClientProps {
  playerId: string;
}

/**
 * What the engine asks of the screen that draws it.
 *
 * Identity matters: `showToast` is a dependency of the autosave, hole-checkpoint and conflict callbacks, and the
 * two nav functions of the effect that hides the nav for the round. A new function each render re-creates those
 * callbacks and re-runs that effect each render. The legacy screen passes exactly that on purpose (`useToast()`
 * makes new functions per call and the nav context per provider render, as the engine used to get them), so its
 * behaviour is unchanged. A new renderer passes stable, module-level ports, as the shot screen does
 * (`ShotTrackingPorts`), and gets each callback made once.
 */
export interface NewRoundSessionPorts {
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => unknown;
  hideMobileNav: () => void;
  showMobileNav: () => void;
  /** The error tick on a failed submit. The legacy screen passes `@/lib/haptics`; Clubhouse passes its own (its `useAction` already ticks, so it may pass a no-op). */
  haptic: (event: 'error') => unknown;
}

/** What a screen may tell the new-round engine beyond its ports; each omitted value is the Fairway screen's own. */
export interface NewRoundSessionOptions {
  ports: NewRoundSessionPorts;
  /** Where the engine sends the player. Read at call time, so passing a new object each render is safe. */
  routes?: Partial<RoundSessionRoutes>;
  /** The `component` and `route` tags on the error log of a round start that failed. */
  logSource?: RoundSessionLogSource;
}

/**
 * The new-round engine: setup, holes, tracking, autosave, recovery and submit, without the screen that draws it.
 * Moved out of NewRoundClient unchanged (ROUNDS_PLAN step 4a), so a second renderer can drive the same engine.
 */
/**
 * Drop the v1 failed-submit entry queued for a discarded round, never failing
 * the discard: best effort, since the sync drain also skips a round marked
 * discarded on this device.
 */
function forgetQueuedRound(roundId: string): void {
  void Promise.resolve().then(() => deleteOfflineRound(roundId)).catch(() => {});
}

export function useNewRoundSession({ playerId, ports, routes, logSource }: NewRoundClientProps & NewRoundSessionOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast, haptic } = ports;
  // Read at call time, never listed as a dependency: a screen that passes a new `routes` object each render must not
  // re-create the callbacks or re-run the effects that list `router`.
  const routesRef = useRef(resolveRoundRoutes(routes));
  routesRef.current = resolveRoundRoutes(routes);
  const logSourceRef = useRef(logSource ?? LEGACY_NEW_ROUND_LOG_SOURCE);
  logSourceRef.current = logSource ?? LEGACY_NEW_ROUND_LOG_SOURCE;
  // Unfinished rounds are surfaced on the /rounds page (UnfinishedRoundsSection),
  // not as a gate here — starting a New Round lands straight on the course
  // carousel. There is no in-flow resume prompt (the old prompt state was never
  // reachable), so this page no longer fetches the in-progress round.

  // Hide mobile bottom nav for entire round flow (setup → holes → tracking → submit)
  const { hideMobileNav, showMobileNav } = ports;
  useEffect(() => {
    hideMobileNav();
    return () => showMobileNav();
  }, [hideMobileNav, showMobileNav]);

  // New connection status hook
  const connectionStatus = useConnectionStatus();

  // Zustand store for offline sync state
  const syncStatus = useOfflineSyncStatus();
  // Note: We access store directly via useOfflineSyncStore.getState() to avoid dependency issues in useEffects

  // Track offline warning banner visibility (initialize based on current connection)
  const [showOfflineWarning, setShowOfflineWarning] = useState(!connectionStatus.isOnline);

  // Initialize sync engine on mount
  useEffect(() => {
    const initializeSyncEngine = async () => {
      try {
        const syncEngine = getSyncEngine();

        // Register callbacks with a unique ID
        syncEngine.registerCallback('new-round-client', {
          onSyncStart: () => {
            // Store handles this via its own registered callbacks
          },
          onSyncComplete: (_result) => {
            // Offline data synced successfully
          },
          onSyncError: (_error) => {
          },
        });

        // Start the sync engine
        syncEngine.start();
        // Access store directly to avoid dependency issues
        await useOfflineSyncStore.getState().updatePendingCount();
      } catch {
        // Silently ignore sync init errors
      }
    };

    initializeSyncEngine();

    return () => {
      const syncEngine = getSyncEngine();
      syncEngine.unregisterCallback('new-round-client');
      syncEngine.stop();
    };
  }, []); // Run only on mount

  // Update connection status in store and show/hide warning
  useEffect(() => {
    const store = useOfflineSyncStore.getState();
    store.setOnline(connectionStatus.isOnline);
    // ConnectionQuality is 'excellent' | 'good' | 'fair' | 'poor' | 'offline'
    store.setSlowConnection(connectionStatus.quality === 'poor' || connectionStatus.quality === 'fair');

    // Show warning when going offline
    if (!connectionStatus.isOnline) {
      setShowOfflineWarning(true);
    }
  }, [connectionStatus.isOnline, connectionStatus.quality]);

  // Re-show offline warning if sync errors occur (even when online)
  useEffect(() => {
    if (syncStatus.syncError) {
      setShowOfflineWarning(true);
    }
  }, [syncStatus.syncError]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (connectionStatus.isOnline && syncStatus.pendingCount.total > 0) {
      const timeout = setTimeout(async () => {
        try {
          const syncEngine = getSyncEngine();
          await syncEngine.syncNow();
        } catch {
          // Silently ignore sync errors
        }
      }, 2000);

      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [connectionStatus.isOnline, syncStatus.pendingCount.total]);

  const [step, setStep] = useState<'setup' | 'holes' | 'tracking' | 'submitting'>('setup');
  const [setupData, setSetupData] = useState<RoundSetupForm>({
    courseName: '',
    courseCity: '',
    courseState: '',
    courseRating: '',
    courseSlope: '',
    teesPlayed: 'White',
    roundType: 'practice',
    roundDate: '', // Set on mount to avoid hydration mismatch (server UTC vs client local)
  });
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>([]);
  const [error, setError] = useState('');
  const [showExitModal, setShowExitModal] = useState(false);
  const [savedRoundId, setSavedRoundId] = useState<string | null>(null);
  const [inProgressShotsByHole, setInProgressShotsByHole] = useState<Record<number, ShotRecord[]>>({});
  const [holesPerRound, setHolesPerRound] = useState<9 | 18>(18);
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;
  const isSubmittingRef = useRef(false);
  const serverSaveInProgressRef = useRef(false);
  const pendingServerSaveRef = useRef<{
    shots: ShotRecord[];
    holeIndex: number;
    roundData?: PartialRoundData;
    emergencyTimestamp?: number;
  } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
  const lastAutoSaveWarningRef = useRef(0); // Timestamp to throttle warning toasts
  const savedRoundIdRef = useRef<string | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);
  // Optimistic locking: tracks the last server-side updated_at for conflict detection
  const lastServerUpdatedAtRef = useRef<string | undefined>(undefined);
  // B2: set once polling proves the server moved past this device's own
  // checkpoint, or a save comes back `conflict`. Every write entry point
  // checks this and refuses to write until the player reloads — a stale
  // device must never overwrite newer server holes. New Round gets a real
  // server round id after its first successful save, same as Continue
  // Round, so the same multi-device hazard applies here too.
  const roundConflictBlockedRef = useRef(false);
  const [roundConflictBlocked, setRoundConflictBlocked] = useState(false);
  // C1: set synchronously in `handleDeleteRound`, BEFORE the delete call —
  // the race is a checkpoint/auto-save already in flight for this SAME
  // round id whose `round_missing` response lands after the delete. Every
  // `round_missing` branch below (checkpoint, auto-save primary, auto-save's
  // queued follow-up, Save & Exit) checks this before dropping the id or
  // re-creating, so a discard can never be resurrected as a fresh
  // `in_progress` round. Cleared if the delete itself fails — a failed
  // discard means the round is still live, and a later `round_missing` for
  // it is a real anomaly, not this race. A plain ref (not a module-level
  // store) is sufficient: an in-flight promise's closure still sees this
  // same ref object after the component unmounts and navigates away.
  const roundDiscardedRef = useRef(false);
  // MASTER_BUG_REPORT_2026-09-02.md Part 1: the exit dialog's Save for later
  // (and Discard) navigate away with `router.push`, a client-side transition
  // that does not itself fire `beforeunload` — but `handleBeforeUnload`
  // below never checks whether the round was just saved, only whether
  // `step` has left 'setup', so it stays "true" long after a successful
  // save. If a real unload event ever does coincide with that navigation,
  // the round has already been safely saved or intentionally discarded and
  // the warning would be a false positive. Set true BEFORE the `router.push`
  // in both handleSaveForLater and handleDeleteRound so handleBeforeUnload
  // (and the pagehide beacon) bail out for exactly those two exits — a
  // genuinely unsaved close/refresh/back is untouched.
  const roundExitedSafelyRef = useRef(false);
  // R-8: once the round is discarded or left, no timer writes its device copy back.
  const backupOnDevice = useCallback((data: EmergencySaveData): boolean => {
    if (roundDiscardedRef.current || roundExitedSafelyRef.current) return false;
    return emergencySave(data);
  }, []);
  // The auto-save's offline test, read at call time: `navigator.onLine` alone
  // is not trusted (WKWebView reports false on some networks), so it is
  // offline only when the last /api/health probe agrees, as the start path does.
  const probeConnectedRef = useRef(connectionStatus.isConnected);
  probeConnectedRef.current = connectionStatus.isConnected;
  // R-4: another tab on this device (the Library, a second round screen)
  // discarded this round; this screen must not re-create it.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DISCARDED_ROUNDS_STORAGE_KEY && wasRoundDiscarded(savedRoundIdRef.current, playerId)) {
        roundDiscardedRef.current = true;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [playerId]);
  // B9: true while a write issued under the current lock token has an
  // outcome this device could not read — a background beacon, or a
  // foreground save the browser killed mid-flight. See the matching ref in
  // continue-round-client.tsx and src/lib/golf/round-write-outcome.ts.
  const pendingUnreadableWriteRef = useRef(false);
  // One background beacon per hidden period — iOS fires both
  // visibilitychange-hidden and pagehide for a single backgrounding.
  const beaconSentWhileHiddenRef = useRef(false);
  const [pendingFinalStats, setPendingFinalStats] = useState<HoleStats[] | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showBackToSetupModal, setShowBackToSetupModal] = useState(false);
  const [completedRoundId, setCompletedRoundId] = useState<string | null>(null);
  // C3: the coach closed the qualifier this round targets between the
  // player finishing scoring and tapping submit. Distinct from a completed
  // round — this round is still `in_progress` and stays that way, so the
  // submit overlay offers a way OUT (reclassify to practice) instead of
  // "Retry submit", which would return the identical refusal forever.
  const [qualifierClosed, setQualifierClosed] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  // Ref to track the furthest hole the player has naturally progressed to.
  // Used to navigate back correctly after re-editing a completed hole (#21).
  const activeProgressHoleRef = useRef(0);
  // A retry must keep the intent of the original completion attempt. Otherwise
  // the optimistic local score makes a first-time checkpoint retry look like a
  // re-edit, leaving the player on a hole that did successfully save.
  const pendingHoleCheckpointRef = useRef<{
    holeIndex: number;
    wasReEdit: boolean;
    activeProgressHoleIndex: number;
  } | null>(null);

  // Ref for stale closure prevention in async auto-save (#20)
  const inProgressShotsByHoleRef = useRef(inProgressShotsByHole);
  inProgressShotsByHoleRef.current = inProgressShotsByHole;

  // B7: the date input's `max` — computed on mount, same as roundDate's
  // default just below, to avoid a server/client timezone hydration
  // mismatch (the server's "today" and the client's can legitimately
  // differ by a day around midnight in either direction).
  const [maxRoundDate, setMaxRoundDate] = useState<string | undefined>(undefined);

  // Set roundDate on mount to avoid server/client timezone hydration mismatch
  useEffect(() => {
    const today = localDayIso();
    setMaxRoundDate(today);
    if (!setupData.roundDate) {
      setSetupData(prev => ({ ...prev, roundDate: today }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emergency save recovery state
  const [showNewRoundRecovery, setShowNewRoundRecovery] = useState(false);
  const [newRoundRecoveryData, setNewRoundRecoveryData] = useState<EmergencySaveData | null>(null);
  const [isRestoringRecovery, setIsRestoringRecovery] = useState(false);
  // Set synchronously by the mount recovery effect (which is defined BEFORE the
  // auto-open-picker effect, so it runs first in the same commit). Lets the
  // picker effect bail when a `_new` save is pending recovery, so the "Recover
  // Unsaved Progress?" dialog isn't buried under an auto-opened course picker.
  const pendingRecoveryRef = useRef(false);

  // Throttle auto-save warning to at most once per 60s to avoid toast spam
  const showAutoSaveWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoSaveWarningRef.current < 60_000) return;
    lastAutoSaveWarningRef.current = now;
    showToast('Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.', 'warning');
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

  const redirectToCompletedRound = useCallback(() => {
    const targetRoundId = savedRoundIdRef.current;
    if (!targetRoundId) {
      return;
    }

    setError('');
    isSubmittingRef.current = false;
    startTransition(() => {
      router.replace(routesRef.current.round(targetRoundId));
    });
  }, [router]);

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
  // spam the player.
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
   * Resolves `true` when the apparent conflict was this device's own
   * unreadable write (or a concurrent path already resolved it) and the lock
   * token now matches the server, so the caller may retry its write; `false`
   * when the round is now blocked (or was redirected as completed).
   */
  const handleRoundSyncConflict = useCallback(async (
    fallbackMessage: string,
    knownCurrentUpdatedAt?: string | null,
  ): Promise<boolean> => {
    const roundId = savedRoundIdRef.current;
    if (!roundId) {
      // No server round exists yet at all — nothing to reconcile against,
      // and nothing to block (the next persistRoundStart is the only write).
      setError(fallbackMessage);
      showToast(fallbackMessage, 'error');
      return false;
    }

    // B9: a write this device issued but could not read the outcome of (a
    // beacon, or a save the browser killed mid-flight) is indistinguishable
    // from a genuine multi-device conflict until this next check. Treat the
    // next apparent conflict after one as self-caused rather than escalating
    // to a permanent write-block on a single device that simply had its
    // phone lock — see the matching comment in continue-round-client.tsx.
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
      // A genuine multi-device write collision. Do NOT adopt the server's
      // newer `updated_at` into `lastServerUpdatedAtRef` here (B2) — this
      // device's in-memory holes/shots still reflect the OLD state, so
      // resyncing the optimistic-lock token alone would let this device's
      // NEXT save pass the lock and silently overwrite whatever the other
      // device just wrote. Block further writes instead.
      const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
      if (stalenessResult.success && stalenessResult.data.status === 'completed') {
        redirectToCompletedRound();
        return false;
      }
      // Same race, seen from the save side: a concurrent self-heal adopted
      // the token between this save's dispatch and its `conflict` answer.
      if (stalenessResult.success && !stalenessResult.data.isStale) {
        return true;
      }
    } catch {
      // Fall through to the generic conflict message below.
    }

    blockRoundForConflict(fallbackMessage);
    return false;
  }, [blockRoundForConflict, redirectToCompletedRound, showToast]);

  /**
   * Every foreground `savePartialRound` against an existing round goes
   * through here so a call whose outcome the browser lost (killed fetch on
   * phone lock — see round-write-outcome.ts) is recorded as a possibly-landed
   * write under the current token, exactly like a beacon.
   */
  const savePartialRoundTracked = useCallback(async (
    data: PartialRoundData,
    targetRoundId: string | undefined,
  ) => {
    try {
      return await savePartialRound(data, targetRoundId);
    } catch (err) {
      if (targetRoundId && isUnreadableWriteFailure(err)) pendingUnreadableWriteRef.current = true;
      throw err;
    }
  }, []);

  // Check for the freshest emergency save on mount. Restore always persists
  // through savePartialRound before reopening Continue Round. A recovery
  // backup never silently drops an existing server ID after a permission
  // failure; that could re-home a different player's shared-device data.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const localSnapshot = loadLatestEmergencySave(playerId);
      const indexedDbSnapshots = await getRoundRecoverySnapshots()
        .then((snapshots) => snapshots
          .map((snapshot) => snapshot.data)
          .filter((snapshot) => snapshot.playerId === playerId))
        .catch(() => [] as EmergencySaveData[]);
      const emergencyData = [localSnapshot, ...indexedDbSnapshots]
        .filter((snapshot): snapshot is EmergencySaveData => snapshot != null)
        .sort((left, right) => right.timestamp - left.timestamp)[0];
      if (!emergencyData || cancelled) return;
    // Only show recovery if there's meaningful data (at least some holes
    // completed or shots tracked).
    //
    // `Object.keys(...).length > 0` was too weak: the tracker writes a key for
    // the current hole as soon as you land on it, so a brand-new round with an
    // EMPTY shot array still counted as "data" and every fresh start opened a
    // modal offering to restore "0 completed holes". Offering to restore
    // nothing is pure friction, and it trains players to dismiss the dialog
    // reflexively — including the times it holds a real interrupted round.
    // Require an actual shot, not merely the presence of a key.
    const hasInProgressShots = Object.values(
      emergencyData.inProgressShotsByHole || {},
    ).some((shots) => Array.isArray(shots) && shots.length > 0);
    const hasData =
      emergencyData.completedHoleStats?.some(h => h != null) || hasInProgressShots;
    if (hasData) {
      pendingRecoveryRef.current = true;
      setShowNewRoundRecovery(true);
      setNewRoundRecoveryData(emergencyData);
    }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // Refs for visibility change handler — prevents stale closures
  const completedHoleStatsRef = useRef(completedHoleStats);
  completedHoleStatsRef.current = completedHoleStats;
  const holesRef = useRef(holes);
  holesRef.current = holes;
  const setupDataRef = useRef(setupData);
  setupDataRef.current = setupData;
  const holesPerRoundRef = useRef(holesPerRound);
  holesPerRoundRef.current = holesPerRound;

  useRoundStatusSync({
    roundId: savedRoundId,
    expectedUpdatedAtRef: lastServerUpdatedAtRef,
    enabled: step === 'tracking' || step === 'submitting',
    onRoundCompleted: redirectToCompletedRound,
    // B2: the hook already refuses to adopt a newer server updated_at once
    // it proves this device is behind — routed through the same
    // conflict/self-heal decision (B9) an explicit save `conflict` uses.
    onRoundStale: ({ currentUpdatedAt }) => {
      void handleRoundSyncConflict('This round was updated on another device. Please reload.', currentUpdatedAt);
    },
  });

  // Save data when user leaves the page (phone lock, app switch, tab close)
  const stepRef = useRef(step);
  stepRef.current = step;
  // A02-001: same gate as handleBeforeUnload below — once setup has been left,
  // or a course has been named, a stale-asset recovery must not replace the
  // document out from under the entry the player has not saved yet.
  useActiveWork(
    'golf-round-new',
    step !== 'setup' || Boolean(setupData.courseName),
  );

  useEffect(() => {
    // Warn before closing tab/navigating away if there's any data to lose
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Save for later / Discard already resolved this round's fate on the
      // server before navigating away — see roundExitedSafelyRef above.
      if (roundExitedSafelyRef.current) return;
      if (stepRef.current !== 'setup' || setupDataRef.current.courseName) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    // Build save payload from refs (always fresh, no stale closures)
    const buildEmergencyPayload = () => {
      const holesSnapshot = holesRef.current;
      const statsSnapshot = completedHoleStatsRef.current;
      const currentHole = currentHoleIndexRef.current;
      const mergedInProgress = { ...inProgressShotsByHoleRef.current };
      const setup = setupDataRef.current;

      return {
        currentHole,
        holesSnapshot,
        statsSnapshot,
        mergedInProgress,
        setup,
      };
    };

    // Trigger SYNCHRONOUS localStorage save + async server save when app goes to background
    const handlePageHide = () => {
      if (isSubmittingRef.current) return;
      // Skip after Save for later / Discard: for Discard specifically, a
      // beacon fired here (pagehide can follow router.push during the same
      // navigation) would re-write the round the player just deleted —
      // resurrecting it. For Save for later it would just be a redundant
      // write of data already durable server-side.
      if (roundExitedSafelyRef.current) return;
      const { currentHole, holesSnapshot, statsSnapshot, mergedInProgress, setup } = buildEmergencyPayload();

      // 1. SYNCHRONOUS localStorage write — guaranteed to complete before page freeze
      // Fires on ALL steps so setup/holes data is preserved, not just tracking
      emergencySave({
        playerId,
        roundId: savedRoundIdRef.current,
        timestamp: Date.now(),
        setupData: setup,
        holes: holesSnapshot,
        completedHoleStats: statsSnapshot,
        inProgressShotsByHole: mergedInProgress,
        currentHoleIndex: currentHole,
        holesPerRound: holesPerRoundRef.current,
      });

      // 2. Best-effort async server save — only during tracking (needs shot data)
      if (stepRef.current !== 'tracking') return;
      // B2: a device PROVEN behind must not write — the beacon holds no lock
      // token (see below), so this return is the only thing stopping it.
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
      const saveData = {
        courseName: setup.courseName,
        courseCity: setup.courseCity || undefined,
        courseState: setup.courseState || undefined,
        courseRating: setup.courseRating ? parseFloat(setup.courseRating) : undefined,
        courseSlope: setup.courseSlope ? parseInt(setup.courseSlope) : undefined,
        teesPlayed: setup.teesPlayed || undefined,
        roundType: setup.roundType,
        roundDate: setup.roundDate,
        currentHole: Math.min(currentHole + 1, holesSnapshot.length),
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
        // Deliberately NO `expectedUpdatedAt` — see continue-round-client: a
        // beacon has no reader, so a lock rejection would silently drop the
        // last shots before a phone lock. A device PROVEN behind is kept from
        // writing by the `roundConflictBlockedRef` return above.
      };
      // Unload-safe: a plain `void savePartialRound(...)` server-action fetch is
      // killed when the page freezes (phone lock / app switch), so the round
      // never reaches the server and can't be resumed. sendBeacon is guaranteed
      // to deliver during unload. The synchronous emergencySave above is the
      // hard fallback if even the beacon can't be queued.
      if (beaconPartialSave(saveData, savedRoundIdRef.current ?? undefined)) {
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
  }, [playerId]); // All mutable round state is read from refs

  // Browser back button protection during tracking
  const hasUnsavedChangesRef = useRef(false);
  useEffect(() => {
    // Track whether there are unsaved changes
    hasUnsavedChangesRef.current = step === 'tracking' && (
      completedHoleStats.some(s => s != null) ||
      Object.keys(inProgressShotsByHole).length > 0
    );
  }, [step, completedHoleStats, inProgressShotsByHole]);

  useEffect(() => {
    if (step !== 'tracking') return;

    // Push a sentinel history entry so we can detect back navigation
    window.history.pushState({ shotTracking: true }, '');

    const handlePopState = () => {
      if (hasUnsavedChangesRef.current) {
        // Re-push state to prevent actual navigation
        window.history.pushState({ shotTracking: true }, '');
        // Show the exit confirmation modal
        setShowExitModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step]);

  // Qualifier state
  const [qualifiers, setQualifiers] = useState<PlayerQualifierInfo[]>([]);
  const [allActiveQualifiers, setAllActiveQualifiers] = useState<PlayerQualifierInfo[]>([]);
  const [loadingQualifiers, setLoadingQualifiers] = useState(false);
  const [loadingActiveQualifiers, setLoadingActiveQualifiers] = useState(true);
  const [selectedQualifierId, setSelectedQualifierId] = useState<string | null>(null);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);
  const [qualifierError, setQualifierError] = useState<string | null>(null);
  const [qualifierRoundError, setQualifierRoundError] = useState<string | null>(null);
  const [qualifierRoundRetry, setQualifierRoundRetry] = useState(0);
  // The qualifier a `start(form)` adopted, whose round number the form already decided. Null on the legacy screen, whose
  // player picks a qualifier and lets the round-number effect below choose the round.
  const startedQualifierRef = useRef<string | null>(null);

  const buildRecoverySetupData = useCallback(() => ({
    ...setupData,
    qualifierId: setupData.roundType === 'qualifier' ? selectedQualifierId ?? undefined : undefined,
    qualifierRoundNumber: setupData.roundType === 'qualifier' ? selectedRoundNumber ?? undefined : undefined,
  }), [selectedQualifierId, selectedRoundNumber, setupData]);

  const persistFailedSubmission = useCallback(async (allHoleStats: HoleStats[]) => {
    const recoverySetupData = buildRecoverySetupData();
    const currentRoundId = savedRoundIdRef.current;
    const terminalSubmission: TerminalRoundSubmissionData = {
      courseName: recoverySetupData.courseName,
      courseId: resolvedCourseIdRef.current || undefined,
      teeId: selectedTeeIdRef.current || undefined,
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
      roundId: currentRoundId,
      timestamp: Date.now(),
      setupData: recoverySetupData,
      holes,
      completedHoleStats: allHoleStats,
      inProgressShotsByHole: {},
      currentHoleIndex: Math.max(0, holes.length - 1),
      holesPerRound,
      submissionIntent: 'submit',
      terminalSubmission,
    });

    try {
      await saveOfflineRound({
        id: currentRoundId ?? `pending_submit_${Date.now()}`,
        playerId,
        serverRoundId: currentRoundId ?? undefined,
        draftData: {
          step: 'tracking',
          roundId: currentRoundId ?? undefined,
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
  }, [buildRecoverySetupData, holes, holesPerRound, playerId]);

  // Saved courses state
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);
  const [loadingSavedCourses, setLoadingSavedCourses] = useState(true);
  // Recent courses (saved courses enriched with round counts) — quick-pick tile grid
  const [recentCourses, setRecentCourses] = useState<RecentPlayedCourse[]>([]);
  const [courseMode, setCourseMode] = useState<'new' | 'saved'>('new');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // FK to golf_courses (resolved from saved course or server-side fallback)
  const resolvedCourseIdRef = useRef<string | null>(null);
  // Cloud Course Library tee (golf_course_tees.id) when the round was started
  // from the tee picker. Cleared whenever a non-library course is chosen.
  const selectedTeeIdRef = useRef<string | null>(null);
  // R8: set once the player has SEEN the "you already completed a round for
  // this course on this date" warning and tapped Start Round again to proceed —
  // the one primary action confirms itself on a second tap rather than
  // spawning a separate dialog/button. Reset whenever the setup identity
  // (course/date/type/qualifier) changes below, so a stale confirmation
  // can never silently apply to a different course or date.
  const duplicateCourseConfirmedRef = useRef(false);
  // The setup a `start(form)` just adopted. The effect below would otherwise run for that adoption after the start
  // had already begun, and wipe what the start sets (the duplicate warning's confirmation, the conflict prompt).
  const adoptedSetupRef = useRef<NewRoundSetup | null>(null);
  // 36-hole-day follow-up (2026-09-23): when `persistRoundStart` finds the
  // player's own in_progress round already at this course/date, the player —
  // not the server — decides whether it's the same abandoned round (resume
  // or discard) or a genuinely separate round (e.g. round 2 of a 36-hole
  // day). This holds that server signal so the setup screen can present all
  // three choices instead of auto-navigating away.
  const [inProgressConflict, setInProgressConflict] = useState<{
    roundId: string;
    scoredHoles: number;
    updatedAt: string | null;
  } | null>(null);
  const [conflictActionBusy, setConflictActionBusy] = useState(false);
  // Discard is destructive and this dialog only ever appears for a round
  // that already has real progress (an empty shell is reused silently,
  // never surfaced here — see golf.ts's isEmptyShellRound gate) — a single
  // mis-tap would destroy scored holes with no way back. Two-step confirm,
  // same pattern as FairwayUnfinishedBanner's own Discard.
  const [discardConfirming, setDiscardConfirming] = useState(false);
  // Set only by the "Start a new round" choice below, then consumed by the
  // very next persistRoundStart retry — bypasses just the in_progress_exists
  // check server-side, never the duplicate_completed_round warning.
  const confirmSeparateRoundRef = useRef(false);
  // The exact top-level flow that most recently called persistRoundStart
  // (either `startWithPreloadedConfigs` or `handleHolesSave`), so Discard and
  // "Start a new round" can retry the WHOLE flow — including its post-success
  // step (saving the course to the player's library, cloud-catalog
  // contribution, both real, non-cosmetic writes) — not just the bare
  // persistRoundStart call. Set at the top of each of those two functions, so
  // it is always current regardless of which one is in flight.
  const lastStartRetryRef = useRef<(() => Promise<unknown>) | null>(null);
  // Set while a `start(form)` runs; see there.
  const startInFlightRef = useRef(false);
  // Reactive mirror of "a cloud tee is selected" (selectedTeeIdRef is a ref and
  // can't drive render). Kept in lockstep with selectedTeeIdRef so the setup
  // screen can show a read-only "Course ready" confirmation for a cloud pick
  // instead of an editable form — editing the form would otherwise persist the
  // edited name against the original (now-mismatched) tee_id/course_id.
  const [cloudPickActive, setCloudPickActive] = useState(false);
  // R8: a confirmed duplicate-course warning applies only to the exact setup
  // it was shown for. Any change to what would actually start recomputes the
  // dedupe check server-side next tap.
  useEffect(() => {
    const adopted = adoptedSetupRef.current;
    adoptedSetupRef.current = null;
    if (
      adopted
      && adopted.setup.courseName === setupData.courseName
      && adopted.setup.roundDate === setupData.roundDate
      && adopted.setup.roundType === setupData.roundType
      && adopted.qualifierId === selectedQualifierId
      && adopted.qualifierRoundNumber === selectedRoundNumber
    ) {
      return;
    }
    duplicateCourseConfirmedRef.current = false;
    confirmSeparateRoundRef.current = false;
    setInProgressConflict(null);
    setDiscardConfirming(false);
  }, [
    setupData.courseName,
    setupData.roundDate,
    setupData.roundType,
    selectedQualifierId,
    selectedRoundNumber,
  ]);
  // Course imagery for the confirm screen, carried out of the picker with the
  // tee (FairwayCoursePicker already had the golf_courses row in hand). Null on
  // every non-cloud path, where CourseImage falls back to its name-derived photo.
  const [pickedCourseImage, setPickedCourseImage] = useState<{
    imageUrl: string | null;
    normalizedName: string | null;
  } | null>(null);
  const [teePickerOpen, setTeePickerOpen] = useState(false);
  // RE-F2: a quick-pick start waiting for its setup state to commit.
  const [pendingQuickStart, setPendingQuickStart] = useState<SavedCourseHoleConfig[] | null>(null);
  const [preloadedHoleConfigs, setPreloadedHoleConfigs] = useState<SavedCourseHoleConfig[] | null>(null);
  const [saveCourseChecked, setSaveCourseChecked] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [nineSelection, setNineSelection] = useState<'front' | 'back'>('front');

  // Fetch active qualifiers on mount for the quick-select cards
  useEffect(() => {
    getPlayerQualifiers()
      .then(result => {
        setLoadingActiveQualifiers(false);
        if (result.success) {
          const active = result.data.filter(
            q => q.status !== 'completed' && q.roundsCompleted < q.numRounds
          );
          setAllActiveQualifiers(active);
        }
      })
      .catch(() => {
        setLoadingActiveQualifiers(false);
      });
  }, []);

  // Auto-select qualifier from URL param (e.g. ?qualifier=<id>)
  const urlQualifierHandled = useRef(false);
  useEffect(() => {
    if (urlQualifierHandled.current) return;
    const qualifierParam = searchParams.get('qualifier');
    if (qualifierParam) {
      urlQualifierHandled.current = true;
      setSetupData(prev => ({ ...prev, roundType: 'qualifier' }));
      setSelectedQualifierId(qualifierParam);
    }
  }, [searchParams]);

  // Reusable qualifier fetch — runs on round-type change AND on the inline
  // "Try again" retry, so a transient failure recovers without a full page
  // refresh (Nielsen #9: help users recover from errors).
  const loadQualifiers = useCallback(() => {
    setLoadingQualifiers(true);
    setQualifierError(null);
    getPlayerQualifiers()
      .then(result => {
        setLoadingQualifiers(false);
        if (!result.success) {
          setQualifierError(result.error);
          return;
        }
        // Keep every coach-open qualifier visible. A reached cap is a distinct,
        // actionable state; filtering it away made an open qualifier look as
        // though it had vanished and hid the server's precise explanation.
        const activeQualifiers = result.data.filter(
          q => q.status !== 'completed'
        );
        setQualifiers(activeQualifiers);
        if (activeQualifiers.length === 0) {
          setQualifierError('You have no coach-open qualifiers to enter rounds for.');
        }
      })
      .catch((err: Error) => {
        // RE-X1: a stale action map goes to the one recovery coordinator
        // (attempt budget + unsaved-work check), never a raw reload. If it
        // declines, the inline error below still gives the player a retry.
        if (isStaleServerActionError(err)) softReloadForStaleServerAction(err.message);
        setLoadingQualifiers(false);
        setQualifierError('Failed to load qualifiers. Please try again.');
      });
  }, []);

  // Fetch qualifiers when round type changes to 'qualifier'
  useEffect(() => {
    if (setupData.roundType === 'qualifier') {
      loadQualifiers();
    } else {
      // Reset qualifier state when switching away from qualifier
      // Guard: don't wipe if URL param just set the qualifier (prevents race condition)
      if (!urlQualifierHandled.current) {
        setSelectedQualifierId(null);
      } else {
        urlQualifierHandled.current = false;
      }
      setSelectedRoundNumber(null);
      setAvailableRounds([]);
      setQualifierError(null);
      setQualifierRoundError(null);
    }
  }, [setupData.roundType, loadQualifiers]);

  // Fetch available round numbers when qualifier is selected
  useEffect(() => {
    // `start(form)` adopted this qualifier with its round number, and the round it creates would come back here as the
    // qualifier's active round and replace the tracker with Continue.
    if (selectedQualifierId && selectedQualifierId === startedQualifierRef.current) return undefined;
    let cancelled = false;
    if (selectedQualifierId) {
      setAvailableRounds([]);
      setSelectedRoundNumber(null);
      setQualifierRoundError(null);
      getNextQualifierRoundNumber(selectedQualifierId)
        .then(result => {
          if (cancelled) return;
          if (!result.success) {
            setQualifierRoundError(result.error);
            return;
          }
          if (result.data) {
            if (result.data.activeRoundId) {
              // The server found a durable qualifier parent. Resume it instead
              // of letting a blank new-round setup race or overwrite that
              // player's existing scorecard.
              router.replace(routesRef.current.continueRound(result.data.activeRoundId));
              return;
            }
            setAvailableRounds(result.data.availableRounds);
            // Auto-select the next round number
            if (result.data.nextRoundNumber > 0) {
              setSelectedRoundNumber(result.data.nextRoundNumber);
            }
            return;
          }
          setQualifierRoundError('We could not verify your next qualifier round. Try again before starting.');
        })
        .catch((err: Error) => {
          if (cancelled) return;
          if (isStaleServerActionError(err)) softReloadForStaleServerAction(err.message);
          setQualifierRoundError('We could not verify your next qualifier round. Try again before starting.');
        });
    } else {
      setAvailableRounds([]);
      setSelectedRoundNumber(null);
      setQualifierRoundError(null);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedQualifierId, qualifierRoundRetry, router]);

  const retryQualifierRound = useCallback(() => {
    setQualifierRoundRetry((value) => value + 1);
  }, []);

  // Fetch saved courses on mount
  useEffect(() => {
    getPlayerSavedCourses()
      .then(result => {
        setLoadingSavedCourses(false);
        if (result.success) {
          setSavedCourses(result.data);
          // Auto-select "saved" mode if they have saved courses
          if (result.data.length > 0) {
            setCourseMode('saved');
          }
        }
      })
      .catch((err: Error) => {
        if (isStaleServerActionError(err)) softReloadForStaleServerAction(err.message);
        setLoadingSavedCourses(false);
      });
  }, []);

  // Fetch recent courses (saved courses enriched with round counts) for the
  // quick-pick tile grid. Falls back gracefully — section is hidden if list is empty.
  useEffect(() => {
    getRecentCoursesForPlayer(8)
      .then(result => {
        if (result.success) {
          setRecentCourses(result.data);
        }
      })
      .catch(() => {
        // Silently swallow — quick-pick is a progressive enhancement.
      });
  }, []);

  /**
   * Handle confirmation from the recent-courses quick-pick drawer.
   * Pre-fills setupData with the chosen course and advances directly to
   * the appropriate next step — skipping the manual course-search form.
   *  - If the saved course has hole configs with valid yardages → 'tracking'
   *  - Otherwise → 'holes' (hole configuration step)
   */
  const handleQuickPickConfirm = useCallback((course: RecentPlayedCourse) => {
    // A start already in flight owns the screen; a second tile tap is ignored.
    if (isStartingRound) return;
    // Mirror handleSavedCourseSelect: populate state + refs from the saved course
    setSelectedCourseId(course.id);
    setCourseMode('saved');
    resolvedCourseIdRef.current = course.courseId ?? null;
    selectedTeeIdRef.current = null; // a recent saved course is not a cloud tee
    setCloudPickActive(false);
    setPickedCourseImage(null);
    setSetupData(prev => ({
      ...prev,
      courseName: course.courseName,
      courseCity: course.courseCity || '',
      courseState: course.courseState || '',
      courseRating: course.courseRating?.toString() || '',
      courseSlope: course.courseSlope?.toString() || '',
      teesPlayed: course.teesPlayed || 'White',
    }));
    setPreloadedHoleConfigs(course.holeConfigs);
    if (course.holesPerRound === 9 || course.holesPerRound === 18) {
      setHolesPerRound(course.holesPerRound);
    }
    // Update last_played_at on the saved course (fire-and-forget)
    touchSavedCourse(course.id).catch(() => { /* ignore */ });

    // Advance into the round through the SAME start path as the setup form
    // (RE-F2): validateBeforeStart + persistRoundStart via
    // startWithPreloadedConfigs. Jumping straight to tracking skipped both —
    // no qualifier check, no future-date check, and no durable server parent
    // before the first shot. Those callbacks read `setupData` from their
    // closure, so the start runs from an effect after this state commits
    // (see pendingQuickStart below) rather than inline against stale values.
    const hasValidYardages = course.holeConfigs?.some(h => h.yardage > 0) ?? false;
    if (course.holeConfigs && course.holeConfigs.length > 0 && hasValidYardages) {
      const targetCount = course.holesPerRound === 9 ? 9 : 18;
      setError('');
      setIsStartingRound(true);
      setPendingQuickStart(course.holeConfigs.slice(0, targetCount));
    } else {
      // No usable hole configs — go to the configuration step with what we have
      setStep('holes');
    }
  }, [isStartingRound]);

  /**
   * Start from the Cloud Course Library tee picker: populate the setup form +
   * per-hole defaults from the chosen tee, and record the tee id so the round
   * links to golf_rounds.tee_id. The round still snapshots its own holes — the
   * tee only seeds defaults. We leave the user on the setup screen to confirm.
   */
  const handleTeePick = useCallback((d: TeeRoundDefaults) => {
    // Survive a document reload before the round exists on the server (see
    // new-round-pick-cache.ts); the restore below replays this same handler.
    savePendingTeePick(playerId, d);
    setCourseMode('saved');
    setSelectedCourseId(null);
    resolvedCourseIdRef.current = d.courseId;
    selectedTeeIdRef.current = d.teeId;
    setCloudPickActive(true);
    setPickedCourseImage({
      imageUrl: d.courseImageUrl ?? null,
      normalizedName: d.courseNormalizedName ?? null,
    });
    setSetupData(prev => ({
      ...prev,
      courseName: d.courseName,
      courseCity: d.courseCity || '',
      courseState: d.courseState || '',
      courseRating: d.courseRating != null ? d.courseRating.toString() : '',
      courseSlope: d.slopeRating != null ? d.slopeRating.toString() : '',
      teesPlayed: d.teeName,
    }));
    const configs: SavedCourseHoleConfig[] = d.holes.map(h => ({
      holeNumber: h.holeNumber,
      par: h.par,
      yardage: h.yardage ?? 0,
    }));
    // A DRAFT tee can carry fewer holes than its declared holesCount (e.g. an
    // 18-hole tee with only a few holes entered). Pad the gap with par-4
    // placeholders so the round always has a complete hole set and downstream
    // holes[i] lookups for the missing numbers are never undefined.
    const targetCount = d.holesCount === 9 || d.holesCount === 18 ? d.holesCount : configs.length;
    if (configs.length < targetCount) {
      const have = new Set(configs.map(c => c.holeNumber));
      for (let n = 1; n <= targetCount; n++) {
        if (!have.has(n)) configs.push({ holeNumber: n, par: 4, yardage: 0 });
      }
      configs.sort((a, b) => a.holeNumber - b.holeNumber);
    }
    setPreloadedHoleConfigs(configs);
    if (d.holesCount === 9 || d.holesCount === 18) setHolesPerRound(d.holesCount);
  }, [playerId]);

  // Any path that drops the cloud pick (manual course, saved course, "change
  // course") also drops the reload record, so a cleared course never comes
  // back on the next mount. Only a true→false transition counts: on a fresh
  // mount the flag is false before the restore below has had its turn.
  const cloudPickWasActiveRef = useRef(false);
  useEffect(() => {
    if (cloudPickWasActiveRef.current && !cloudPickActive) clearPendingTeePick(playerId);
    cloudPickWasActiveRef.current = cloudPickActive;
  }, [cloudPickActive, playerId]);

  // The course picker IS the first screen of a new round. Auto-open it once
  // on a fresh start (not resuming, nothing chosen yet) so picking a course
  // is the landing action; "Browse course library" stays as the reopen
  // affordance. Closing it without picking falls back to the setup screen and
  // does not reopen (the ref latches).
  const autoOpenedPickerRef = useRef(false);
  useEffect(() => {
    if (step !== 'setup') return;
    if (autoOpenedPickerRef.current) return;
    // A `_new` emergency save is pending recovery — let the "Recover Unsaved
    // Progress?" dialog surface instead of burying it under the course picker.
    if (pendingRecoveryRef.current) return;
    // Don't auto-open the cloud picker offline — listCourses needs the network and
    // would greet the user with an error toast + empty library. The offline-friendly
    // saved-course / manual path on the setup screen still works; "Browse course
    // library" stays available to retry once back online.
    if (!connectionStatus.isOnline) return;
    const nothingChosenYet =
      !selectedCourseId && selectedTeeIdRef.current == null && !setupData.courseName;
    autoOpenedPickerRef.current = true;
    if (!nothingChosenYet) return;
    // A tee picked before this document was reloaded (WKWebView process
    // kill, stale-asset recovery) comes back as the setup screen it was on,
    // not as a fresh course picker — that reset with no message is exactly
    // what a phone reload looked like to the player.
    const pending = loadPendingTeePick(playerId);
    if (pending) {
      // Not a failure, but the only evidence we get that the page reloaded
      // mid-setup — the process kill that caused it never reaches JS. Logged
      // as an info-level Sentry log + breadcrumb, never as an exception
      // (see new-round-setup-restore-signal.ts).
      reportRoundSetupRestoredAfterReload({ courseId: pending.courseId, teeId: pending.teeId }, logSourceRef.current);
      handleTeePick(pending);
      return;
    }
    setTeePickerOpen(true);
  }, [step, selectedCourseId, setupData.courseName, connectionStatus.isOnline, playerId, handleTeePick]);

  // Handle saved course selection
  const handleSavedCourseSelect = (courseId: string | null) => {
    setSelectedCourseId(courseId);

    if (!courseId) {
      // Cleared selection - reset form
      setSetupData(prev => ({
        ...prev,
        courseName: '',
        courseCity: '',
        courseState: '',
        courseRating: '',
        courseSlope: '',
        teesPlayed: 'White',
      }));
      setPreloadedHoleConfigs(null);
      resolvedCourseIdRef.current = null;
      selectedTeeIdRef.current = null;
      setCloudPickActive(false);
    setPickedCourseImage(null);
      return;
    }

    const course = savedCourses.find(c => c.id === courseId);
    if (course) {
      // Store the golf_courses FK from the saved course
      resolvedCourseIdRef.current = course.courseId ?? null;
      selectedTeeIdRef.current = null; // saved course, not a cloud tee
      setCloudPickActive(false);
    setPickedCourseImage(null);
      // Populate form with saved course data
      setSetupData(prev => ({
        ...prev,
        courseName: course.courseName,
        courseCity: course.courseCity || '',
        courseState: course.courseState || '',
        courseRating: course.courseRating?.toString() || '',
        courseSlope: course.courseSlope?.toString() || '',
        teesPlayed: course.teesPlayed || 'White',
      }));
      // Store hole configs to use in next step
      setPreloadedHoleConfigs(course.holeConfigs);
      // Auto-set holes per round from saved course
      if (course.holesPerRound === 9 || course.holesPerRound === 18) {
        setHolesPerRound(course.holesPerRound);
      }
      // Update last used timestamp
      touchSavedCourse(courseId);
    }
  };

  // Auto-save draft whenever state changes (30-second intervals via hook)
  // Only for setup/holes steps — during tracking, savePartialRound handles persistence
  // to avoid dual saves that can create separate round records (race condition).
  useEffect(() => {
    // Don't save if we haven't started (still on setup with no data)
    if (step === 'setup' && !setupData.courseName) {
      return;
    }

    // Don't save while submitting
    if (step === 'submitting') {
      return;
    }

  // During tracking, savePartialRound handles persistence — use emergency local save only
  if (step === 'tracking') {
    return;
  }

    // Keep setup/hole-selection recovery local-only to avoid mixed draft/persisted round writes.
    emergencySave({
      playerId,
      roundId: savedRoundIdRef.current,
      timestamp: Date.now(),
      setupData: {
        ...setupData,
        qualifierId: selectedQualifierId ?? undefined,
        qualifierRoundNumber: selectedRoundNumber ?? undefined,
      },
      holes,
      completedHoleStats,
      inProgressShotsByHole,
      currentHoleIndex,
      holesPerRound,
    });
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, selectedQualifierId, selectedRoundNumber, inProgressShotsByHole, holesPerRound, playerId]);


  /**
   * The start gate, over this screen's own setup state. The rules (and why they are shared by every control that
   * starts a round) live in `validateStartForm`, which `start(form)` runs over the form it is given.
   */
  const validateBeforeStart = useCallback((): string | null => {
    return validateStartForm({ setup: setupData, qualifierId: selectedQualifierId, qualifierRoundNumber: selectedRoundNumber });
  }, [setupData, selectedQualifierId, selectedRoundNumber]);

  /**
   * Establish the durable parent before a player can record a shot. This is
   * the Continue Round contract: a started round is already an in-progress
   * server row, never a browser-only attempt that depends on a later autosave.
   */
  const persistRoundStart = useCallback(async (
    initialHoles: Hole[],
    configuredHoles: HoleConfig[],
    // The setup to start from. Omitted, it is this screen's own state, as it always was; `start(form)` passes the form
    // it was given, so a start never reads a setup the caller has only just asked React to set.
    startSetup?: NewRoundSetup,
  ): Promise<NewRoundStartResult> => {
    const { setup, qualifierId, qualifierRoundNumber } = startSetup
      ?? { setup: setupData, qualifierId: selectedQualifierId, qualifierRoundNumber: selectedRoundNumber };
    const initialData: PartialRoundData = {
      courseName: setup.courseName,
      courseId: resolvedCourseIdRef.current || undefined,
      teeId: selectedTeeIdRef.current || undefined,
      courseCity: setup.courseCity || undefined,
      courseState: setup.courseState || undefined,
      courseRating: setup.courseRating ? parseFloat(setup.courseRating) : undefined,
      courseSlope: setup.courseSlope ? parseInt(setup.courseSlope) : undefined,
      teesPlayed: setup.teesPlayed || undefined,
      roundType: setup.roundType,
      roundDate: setup.roundDate,
      qualifierId: setup.roundType === 'qualifier' ? qualifierId ?? undefined : undefined,
      qualifierRoundNumber: setup.roundType === 'qualifier' ? qualifierRoundNumber ?? undefined : undefined,
      currentHole: 1,
      holesToPlay: configuredHoles.length as 9 | 18,
      holes: [],
      inProgressShots: [],
      holeConfigs: configuredHoles.map((hole) => ({
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage,
      })),
    };

    // A start that never reaches the server is invisible to every log we
    // have, so record why here (UNCW, Oviinbyrd GC, 2026-09-17: "it tries to
    // load then resets, no error message" — nothing server-side to read).
    const reportStartFailure = (reason: string, detail?: Record<string, unknown>) => {
      logError(
        new Error(`Round start failed: ${reason}`),
        {
          component: logSourceRef.current.component,
          action: 'round start',
          route: logSourceRef.current.route,
          featureArea: 'round_tracking',
          reason,
          courseId: resolvedCourseIdRef.current ?? null,
          teeId: selectedTeeIdRef.current ?? null,
          roundType: setup.roundType,
          roundDate: setup.roundDate,
          holeCount: configuredHoles.length,
          navigatorOnLine: typeof navigator !== 'undefined' ? navigator.onLine : null,
          probeConnected: connectionStatus.isConnected,
          ...detail,
        },
        'medium',
      );
    };

    // `navigator.onLine` alone is not trusted: WKWebView reports false on some
    // reachable networks, and a false negative here silently blocks every
    // start without a request. Only refuse when the last /api/health probe
    // (`isConnected`, not `isOnline`, which mirrors navigator.onLine) also
    // failed; otherwise attempt the save and let the catch below report it.
    if (!navigator.onLine && !connectionStatus.isConnected) {
      reportStartFailure('offline');
      const message = 'Connect to the internet before starting so this round can be saved and resumed.';
      setError(message);
      return { ok: false, reason: 'offline', error: message };
    }

    try {
      const result = await savePartialRound(initialData, undefined, {
        startIntent: true,
        confirmDuplicateCourse: duplicateCourseConfirmedRef.current,
        confirmSeparateRound: confirmSeparateRoundRef.current,
      });
      if (!result.success) {
        // R8: the player's own in-progress round already occupies this
        // exact course/date/qualifier slot with real progress. Nothing was
        // created. 36-hole-day follow-up: don't assume it's the same
        // abandoned round — a college player can legitimately start a
        // second, separate round for the same course/date. Show the
        // conflict prompt (Resume / Discard / Start a new round) instead of
        // auto-navigating away.
        if (result.error === 'in_progress_exists' && 'roundId' in result) {
          reportStartFailure('in_progress_exists', { existingRoundId: result.roundId });
          setDiscardConfirming(false);
          setInProgressConflict({
            roundId: result.roundId,
            scoredHoles: result.scoredHoles,
            updatedAt: result.updatedAt,
          });
          return {
            ok: false,
            reason: 'in_progress_exists',
            error: 'You already have an in-progress round for this course and date.',
            roundId: result.roundId,
          };
        }
        // R8: a COMPLETED round already occupies this slot. Warn once; a
        // second tap of the same "Start round" control (duplicateCourseConfirmedRef)
        // proceeds — one primary action, confirmed by repeating it.
        if (result.error === 'duplicate_completed_round' && 'completedRoundId' in result) {
          // Expected guard, not a failure: the server found a completed round
          // on this course/date and the next tap proceeds. Counted as an info
          // log, never a Bridge incident (633f48a5).
          reportDuplicateCompletedRoundWarned({
            completedRoundId: result.completedRoundId,
            courseId: resolvedCourseIdRef.current ?? null,
            teeId: selectedTeeIdRef.current ?? null,
            roundType: setup.roundType,
            roundDate: setup.roundDate,
          }, logSourceRef.current);
          duplicateCourseConfirmedRef.current = true;
          const message = 'You already have a completed round for this course on this date. Tap Start round again to start a new one anyway.';
          setError(message);
          return { ok: false, reason: 'duplicate_completed_round', error: message };
        }
        // B6: this call always sends `holes: []` (a fresh round), so
        // `conflict`/`round_missing`/`hole_invalid` cannot occur here — but
        // `busy`/`retry` can, and both are bare signal keys, not sentences.
        reportStartFailure('server_rejected', { serverError: result.error });
        const message = describeRoundWriteFailure(result.error);
        setError(message);
        return { ok: false, reason: 'server_rejected', error: message };
      }

      // A round genuinely started — any stale duplicate confirmation from an
      // earlier tap no longer applies.
      duplicateCourseConfirmedRef.current = false;
      confirmSeparateRoundRef.current = false;
      setInProgressConflict(null);
      setDiscardConfirming(false);

      savedRoundIdRef.current = result.data.roundId;
      setSavedRoundId(result.data.roundId);
      if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
      // The round now exists server-side; Continue Round owns it from here.
      clearPendingTeePick(playerId);
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setInProgressShotsByHole({});
      setCurrentHoleIndex(0);
      activeProgressHoleRef.current = 0;
      emergencySave({
        playerId,
        roundId: result.data.roundId,
        timestamp: Date.now(),
        setupData: setup,
        holes: initialHoles,
        completedHoleStats: [],
        inProgressShotsByHole: {},
        currentHoleIndex: 0,
        holesPerRound: configuredHoles.length as 9 | 18,
      });
      return { ok: true, roundId: result.data.roundId };
    } catch (err) {
      reportStartFailure('transport', {
        errorName: err instanceof Error ? err.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      const message = 'Unable to save this round. Please try again before tracking.';
      setError(message);
      return { ok: false, reason: 'transport', error: message };
    }
  }, [connectionStatus.isConnected, playerId, selectedQualifierId, selectedRoundNumber, setupData]);

  /**
   * 36-hole-day conflict prompt actions. `inProgressConflict` is set by
   * `persistRoundStart` when the server reports the player's own in_progress
   * round already occupies this course/date/qualifier slot — none of these
   * three choices happens automatically.
   */
  const handleConflictResume = () => {
    if (!inProgressConflict) return;
    router.push(routesRef.current.continueRound(inProgressConflict.roundId));
  };

  // Destructive — requires the two-step confirm below (discardConfirming)
  // before this ever runs. Never called directly from the dialog's initial
  // "Discard" tap.
  const handleConflictConfirmDiscard = async () => {
    if (!inProgressConflict || !discardConfirming || conflictActionBusy) return;
    setConflictActionBusy(true);
    try {
      const result = await deleteInProgressRound(inProgressConflict.roundId);
      if (!result.success) {
        setError(result.error || 'Failed to discard round');
        setConflictActionBusy(false);
        return;
      }
      clearEmergencySave(inProgressConflict.roundId, playerId);
      setInProgressConflict(null);
      setDiscardConfirming(false);
      setConflictActionBusy(false);
      // The slot is now free — retry the WHOLE original flow (not just
      // persistRoundStart) so the player doesn't have to re-tap "Start
      // round" and doesn't silently lose the save-course step.
      if (lastStartRetryRef.current) {
        setIsStartingRound(true);
        await lastStartRetryRef.current();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard round');
      setConflictActionBusy(false);
    }
  };

  const handleConflictStartNewRound = async () => {
    if (!inProgressConflict || conflictActionBusy || !lastStartRetryRef.current) return;
    setConflictActionBusy(true);
    confirmSeparateRoundRef.current = true;
    setInProgressConflict(null);
    setDiscardConfirming(false);
    setIsStartingRound(true);
    // Retrying via `lastStartRetryRef` re-runs the exact original flow —
    // including its post-success step (save-course-to-library, cloud
    // contribution), which is a real write, not cosmetic.
    await lastStartRetryRef.current();
    setConflictActionBusy(false);
  };

  /**
   * The "skip hole-config, start immediately" path from handleSetupSubmit,
   * extracted so the 36-hole-day conflict prompt's Discard/Start-a-new-round
   * retries can re-run the WHOLE flow — including the cloud-catalog
   * contribution below, a real write, not cosmetic — not just
   * persistRoundStart in isolation.
   */
  const startWithPreloadedConfigs = useCallback(async (configs: SavedCourseHoleConfig[]) => {
    lastStartRetryRef.current = () => startWithPreloadedConfigs(configs);
    const initialHoles: Hole[] = configs.map((h, idx) => ({
      number: idx + 1, // Renumber 1-9 regardless of front/back
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    const persisted = await persistRoundStart(initialHoles, configs);
    if (!persisted.ok) {
      setIsStartingRound(false);
      return;
    }
    // Grow the shared Cloud Course Library from a CURATED saved course that
    // skipped hole-config and isn't in the cloud yet (saved-course origin →
    // selectedCourseId set, but no resolved cloud course/tee). Curated origin =
    // safe to contribute without the "save course" opt-in (no typo-pollution
    // risk, unlike a hand-typed name — those still grow only via handleHolesSave's
    // opt-in path). Best-effort + dedup-aware: never blocks starting the round.
    if (selectedCourseId != null && resolvedCourseIdRef.current == null && selectedTeeIdRef.current == null) {
      void (async () => {
        try {
          const contrib = await contributeCourseFromRound({
            courseName: setupData.courseName,
            city: setupData.courseCity || null,
            state: setupData.courseState || null,
            teeName: setupData.teesPlayed || null,
            courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : null,
            slopeRating: setupData.courseSlope ? parseInt(setupData.courseSlope) : null,
            holes: configs.map(h => ({ holeNumber: h.holeNumber, par: h.par, yardage: h.yardage })),
          });
          if (contrib.success) {
            resolvedCourseIdRef.current = contrib.data.courseId;
            if (contrib.data.teeId) selectedTeeIdRef.current = contrib.data.teeId;
          }
        } catch { /* best-effort: catalog growth must never block the round */ }
      })();
    }
    setIsStartingRound(false);
    setStep('tracking');
  }, [persistRoundStart, selectedCourseId, setupData.courseName, setupData.courseCity, setupData.courseState, setupData.courseRating, setupData.courseSlope, setupData.teesPlayed]);

  // RE-F2: run a quick-pick start once its course state has committed, through
  // the same gate + durable start as the setup form's submit.
  useEffect(() => {
    if (!pendingQuickStart) return;
    const configs = pendingQuickStart;
    setPendingQuickStart(null);
    const validationError = validateBeforeStart();
    if (validationError) {
      setError(validationError);
      setIsStartingRound(false);
      return;
    }
    void startWithPreloadedConfigs(configs);
  }, [pendingQuickStart, validateBeforeStart, startWithPreloadedConfigs]);

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double-clicks / duplicate submissions
    if (isStartingRound) return;
    setIsStartingRound(true);

    const validationError = validateBeforeStart();
    if (validationError) {
      setError(validationError);
      setIsStartingRound(false);
      return;
    }

    // Skip the hole-configuration step when the preloaded config is usable.
    // A CLOUD-PICKED tee provides authoritative pars; its yardages may legitimately
    // be absent (a tee entered with pars only), so for a cloud pick we gate on par
    // — bouncing such a pick to re-enter data the picker already supplied would
    // break the "pre-fills your pars and yardages" promise. Manual / legacy saved
    // courses still require a real yardage before skipping config.
    const isCloudPick = selectedTeeIdRef.current != null;
    const hasUsableConfig =
      preloadedHoleConfigs?.some(h => (isCloudPick ? h.par > 0 : h.yardage > 0)) ?? false;
    if (preloadedHoleConfigs && preloadedHoleConfigs.length > 0 && hasUsableConfig) {
      // Slice to match selected hole count (e.g. user picks 9 on a saved 18-hole course)
      let configs: SavedCourseHoleConfig[];
      if (holesPerRound === 9 && preloadedHoleConfigs.length >= 18 && nineSelection === 'back') {
        configs = preloadedHoleConfigs.slice(9, 18);
      } else {
        configs = preloadedHoleConfigs.slice(0, holesPerRound);
      }
      await startWithPreloadedConfigs(configs);
    } else {
      // Go to hole configuration step — pre-fill pars from saved config if available
      setIsStartingRound(false);
      setStep('holes');
    }
  };

  /**
   * "Start round" from the confirm screen's inline hole editor.
   *
   * The editor validates its own pars/yardages, but it knows nothing about the
   * round-level rules (qualifier picked, rating/slope in range) that the form's
   * submit path enforces. Run those first so both entry points into tracking
   * are gated identically; on failure surface the same error banner the setup
   * form uses and stay put.
   */
  const handleConfirmedHolesSave = async (configuredHoles: HoleConfig[]) => {
    await startRound({
      setup: setupData,
      qualifierId: selectedQualifierId,
      qualifierRoundNumber: selectedRoundNumber,
      courseId: resolvedCourseIdRef.current,
      teeId: selectedTeeIdRef.current,
      saveCourse: saveCourseChecked,
      holes: configuredHoles,
    });
  };

  /**
   * The start behind both "Start round" on the confirm screen (`handleConfirmedHolesSave`, which passes this screen's
   * state) and `start(form)` (which passes the caller's form, `fromStart`): the gate, the durable start, the course
   * save.
   */
  const startRound = async (form: NewRoundStartForm, fromStart = false): Promise<NewRoundStartResult> => {
    const validationError = validateStartForm(form);
    if (validationError) {
      // A validation block is the form working (e2530283): info log, not an error.
      reportRoundStartValidationBlocked({
        validationError,
        roundType: form.setup.roundType,
        roundDate: form.setup.roundDate,
      }, logSourceRef.current);
      setError(validationError);
      return { ok: false, reason: 'invalid', error: validationError };
    }
    setError('');
    setIsStartingRound(true);
    return handleHolesSave(form.holes, form, fromStart);
  };

  const handleHolesSave = async (configuredHoles: HoleConfig[], form: NewRoundStartForm, fromStart = false): Promise<NewRoundStartResult> => {
    // See `lastStartRetryRef`'s own comment: this makes the 36-hole-day
    // conflict prompt's retries re-run the save-course step below too.
    lastStartRetryRef.current = () => handleHolesSave(configuredHoles, form, fromStart);
    // Convert HoleConfig to Hole format
    const initialHoles: Hole[] = configuredHoles.map((h) => ({
      number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    const persisted = await persistRoundStart(initialHoles, configuredHoles, form);
    if (!persisted.ok) {
      setIsStartingRound(false);
      return persisted;
    }

    // Save course configuration if user opted in
    const setup = form.setup;
    const saveCourseToLibrary = async () => {
      const holeConfigs: SavedCourseHoleConfig[] = configuredHoles.map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
      }));

      const result = await savePlayerCourse({
        courseName: setup.courseName,
        courseCity: setup.courseCity || undefined,
        courseState: setup.courseState || undefined,
        courseRating: setup.courseRating ? parseFloat(setup.courseRating) : undefined,
        courseSlope: setup.courseSlope ? parseInt(setup.courseSlope) : undefined,
        teesPlayed: setup.teesPlayed || undefined,
        holesPerRound: configuredHoles.length,
        holeConfigs,
      });

      if (result.success) {
        // Add to local state so it appears if they start another round
        setSavedCourses(prev => [result.data, ...prev.filter(c => c.id !== result.data.id)]);
      }

      // Grow the shared Cloud Course Library from this real, explicitly-saved
      // round — but ONLY when the course wasn't already picked from the library
      // (no cloud tee selected). Dedup-aware + best-effort: it links the round to
      // the resulting cloud course/tee but must NEVER block submission.
      if (selectedTeeIdRef.current == null) {
        try {
          const contrib = await contributeCourseFromRound({
            courseName: setup.courseName,
            city: setup.courseCity || null,
            state: setup.courseState || null,
            teeName: setup.teesPlayed || null,
            courseRating: setup.courseRating ? parseFloat(setup.courseRating) : null,
            slopeRating: setup.courseSlope ? parseInt(setup.courseSlope) : null,
            holes: holeConfigs.map(h => ({ holeNumber: h.holeNumber, par: h.par, yardage: h.yardage })),
          });
          if (contrib.success) {
            resolvedCourseIdRef.current = contrib.data.courseId;
            if (contrib.data.teeId) selectedTeeIdRef.current = contrib.data.teeId;
          }
        } catch { /* best-effort: catalog growth must never block the round */ }
      }
    };
    if (form.saveCourse && setup.courseName) {
      if (fromStart) {
        // The round exists by now. A library save that throws (a dropped connection) must not leave a caller's Start
        // hanging with the round created and the engine still on setup, so it is best-effort here. The legacy screen
        // lets it reject, as it always did.
        try {
          await saveCourseToLibrary();
        } catch { /* best-effort: the library save must never undo a started round */ }
      } else {
        await saveCourseToLibrary();
      }
    }

    setStep('tracking');
    // The legacy screen leaves this set once tracking starts; a caller that follows Back to setup must not find its
    // Start blocked by it.
    if (fromStart) setIsStartingRound(false);
    return persisted;
  };

  /**
   * Start a round from a setup form the caller holds itself (Clubhouse's setup screen), ROUNDS_PLAN step 5a.
   *
   * The start runs over `form`, never over state, so calling it straight after picking a course reads no stale
   * closure. The engine then takes the form on as its own setup (the same values the legacy setup screen would have
   * put in state), so tracking, autosave, recovery and submit run under it.
   *
   * Nothing is adopted until the form has passed every check that can refuse it: the start gate, the hole rules
   * (`validateStartHoles`), and, for a qualifier round, the server's own answer about that round
   * (`getNextQualifierRoundNumber`: a round already in progress is Continue's, and a round number the player cannot
   * play now is refused before it starts a round that could never be submitted). A call while a round is already
   * tracking or submitting, or while another call runs, changes nothing.
   *
   * Then order matters. State is adopted before the durable start, and adoption fires the setup effects:
   *  - the identity effect clears the duplicate-course and start-new bypasses and the conflict prompt. This call does
   *    that itself for a form that changed (before it reads them), and tells the effect the adopted setup is its own,
   *    so the effect, which runs after the start has begun, cannot wipe what the start then sets. A form that did not
   *    change fires nothing, so a second tap of Start after the duplicate warning still confirms it.
   *  - the qualifier effects are told the form's qualifier is already decided (`startedQualifierRef`): left alone the
   *    round-number effect would null the adopted round number, refetch it, and, once the round exists, find it as
   *    the qualifier's active round and `router.replace` the player away from the tracker.
   *
   * A conflict prompt (`inProgressConflict`) leaves the result `in_progress_exists`. Resume / Discard / Start a new
   * round then retry the whole start with this same form, so the renderer follows `step` becoming 'tracking', not
   * the promise, after a retry.
   */
  const start = async (startForm: NewRoundStartForm): Promise<NewRoundStartResult> => {
    // A second call while one runs would meet the server's own dedupe and come back as a conflict with the round the
    // first call has just created, so it is refused here (the legacy screens guard the same way with isStartingRound).
    if (startInFlightRef.current) {
      return { ok: false, reason: 'in_flight', error: 'A round is already starting.' };
    }
    startInFlightRef.current = true;
    try {
      return await startFromForm(startForm);
    } finally {
      startInFlightRef.current = false;
    }
  };
  const startFromForm = async (startForm: NewRoundStartForm): Promise<NewRoundStartResult> => {
    // A round is already tracking or submitting, or was created a moment ago and the screen has not re-rendered as
    // tracking yet (`savedRoundIdRef` is set as soon as it exists). Starting again would take the empty-shell reuse
    // path on the server and wipe the shots held in memory.
    if (stepRef.current === 'tracking' || stepRef.current === 'submitting' || savedRoundIdRef.current) {
      return { ok: false, reason: 'already_started', error: 'A round is already in progress on this screen.' };
    }
    const form = { ...startForm, holes: startForm.holes.map((h, i) => ({ ...h, holeNumber: i + 1 })) };
    const invalid = validateStartForm(form) ?? validateStartHoles(form.holes);
    if (invalid) {
      reportRoundStartValidationBlocked({
        validationError: invalid,
        roundType: form.setup.roundType,
        roundDate: form.setup.roundDate,
      }, logSourceRef.current);
      setError(invalid);
      return { ok: false, reason: 'invalid', error: invalid };
    }
    if (form.setup.roundType === 'qualifier') {
      const refusal = await checkQualifierRound(form);
      if (refusal) {
        setError(refusal.error);
        return refusal;
      }
    }
    const setupChanged =
      form.setup.courseName !== setupData.courseName
      || form.setup.roundDate !== setupData.roundDate
      || form.setup.roundType !== setupData.roundType
      || form.qualifierId !== selectedQualifierId
      || form.qualifierRoundNumber !== selectedRoundNumber;
    if (setupChanged) {
      duplicateCourseConfirmedRef.current = false;
      confirmSeparateRoundRef.current = false;
      setInProgressConflict(null);
      setDiscardConfirming(false);
    }
    adoptedSetupRef.current = form;
    startedQualifierRef.current = form.qualifierId;
    resolvedCourseIdRef.current = form.courseId;
    selectedTeeIdRef.current = form.teeId;
    setCloudPickActive(form.teeId != null);
    setSetupData(form.setup);
    setSelectedQualifierId(form.qualifierId);
    setSelectedRoundNumber(form.qualifierRoundNumber);
    setSaveCourseChecked(form.saveCourse);
    setHolesPerRound(form.holes.length === 9 ? 9 : 18);
    return startRound(form, true);
  };

  /**
   * The round-number check the legacy screen makes when its player picks a qualifier (the effect on
   * `selectedQualifierId`), made for a form that brings its qualifier round with it: the server does not enforce
   * `num_rounds` or entry when a round is created, so a round it will never accept would otherwise start and then
   * fail at submit. Null when the form's round is the one the player can play now.
   */
  const checkQualifierRound = async (form: NewRoundStartForm): Promise<Extract<NewRoundStartResult, { ok: false }> | null> => {
    const unverified = (error?: string): Extract<NewRoundStartResult, { ok: false }> => ({
      ok: false,
      reason: 'qualifier_unverified',
      error: error || 'We could not verify your next qualifier round. Try again before starting.',
    });
    let next: Awaited<ReturnType<typeof getNextQualifierRoundNumber>>;
    try {
      next = await getNextQualifierRoundNumber(form.qualifierId!);
    } catch {
      return unverified();
    }
    if (!next.success) return unverified(next.error);
    if (!next.data) return unverified();
    if (next.data.activeRoundId) {
      return {
        ok: false,
        reason: 'qualifier_round_active',
        error: 'You already have a round in progress for this qualifier.',
        roundId: next.data.activeRoundId,
      };
    }
    if (form.qualifierRoundNumber == null || !next.data.availableRounds.includes(form.qualifierRoundNumber)) {
      return {
        ok: false,
        reason: 'qualifier_round_unavailable',
        error: `Round ${form.qualifierRoundNumber} of this qualifier is not open to you now. Your next round is ${next.data.nextRoundNumber}.`,
      };
    }
    return null;
  };

  /**
   * Build partial round data for server persistence.
   * Accepts overrides for values that may not be in React state yet.
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
      courseId: resolvedCourseIdRef.current || undefined,
      // Persist the cloud tee link on partial/draft saves too — without this a
      // save-for-later round started from a cloud tee writes tee_id=NULL and loses
      // its catalog tee link until (if ever) the final submit repairs it.
      teeId: selectedTeeIdRef.current || undefined,
      courseCity: setupData.courseCity || undefined,
      courseState: setupData.courseState || undefined,
      courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
      courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
      teesPlayed: setupData.teesPlayed || undefined,
      roundType: setupData.roundType,
      roundDate: setupData.roundDate,
      qualifierId: setupData.roundType === 'qualifier' ? selectedQualifierId ?? undefined : undefined,
      qualifierRoundNumber: setupData.roundType === 'qualifier' ? selectedRoundNumber ?? undefined : undefined,
      currentHole: Math.min(holeIndexToUse + 1, roundHoles.length),
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
  }, [selectedQualifierId, selectedRoundNumber, setupData]);

  /**
   * A completed hole is a durable checkpoint, not a best-effort background
   * task. Coalesce any older shot save, wait for its lock to clear, then keep
   * the player on the hole until this complete snapshot is acknowledged.
   */
  /**
   * Forget a roundId the server has no row for.
   *
   * savePartialRound returns 'round_missing' when the target round does not
   * exist (a create that never landed, or a deleted round). Retrying the same
   * id can never succeed, so the only way the player's round survives is to
   * drop the id and let the next save go through the CREATE path — every save
   * already sends the complete snapshot, so nothing is lost by re-creating.
   *
   * lastServerUpdatedAt is cleared too: it belongs to the round that is gone,
   * and sending it as expectedUpdatedAt against a fresh row would come back as
   * a spurious 'conflict'.
   */
  const dropStaleRoundId = useCallback(() => {
    savedRoundIdRef.current = null;
    setSavedRoundId(null);
    lastServerUpdatedAtRef.current = undefined;
  }, []);

  const persistCompletedHole = useCallback(async (
    saveData: PartialRoundData,
    emergencyTimestamp: number,
    surfaceFailure = true,
  ): Promise<boolean> => {
    // B2: a prior conflict/staleness already proved this device is behind.
    // Writing this checkpoint would replace the round with this device's
    // outdated snapshot — refuse until the player reloads.
    if (roundConflictBlockedRef.current) {
      if (surfaceFailure) setError('This round was updated on another device. Please reload.');
      return false;
    }
    // C1: the player discarded this round. A checkpoint attempt that started
    // before the discard (or is retried below) must not resurrect it.
    if (roundDiscardedRef.current) return false;

    pendingServerSaveRef.current = null;
    // Set when an attempt in this loop came back round_missing: the snapshot
    // for this checkpoint was written under that id, so once the re-create
    // lands the snapshot must follow the row (see migrateEmergencySave).
    let staleRoundId: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const waitDeadline = Date.now() + 10_000;
      while (serverSaveInProgressRef.current && Date.now() < waitDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (serverSaveInProgressRef.current) break;

      serverSaveInProgressRef.current = true;
      try {
        // Always the LIVE token: `saveData` captured it at build time, and a
        // self-healed conflict (below) or a dropped id refreshes it mid-loop.
        const result = await savePartialRoundTracked(
          { ...saveData, expectedUpdatedAt: lastServerUpdatedAtRef.current },
          savedRoundIdRef.current ?? undefined,
        );
        if (result.success) {
          consecutiveSaveFailuresRef.current = 0;
          if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
          if (!savedRoundIdRef.current) {
            savedRoundIdRef.current = result.data.roundId;
            setSavedRoundId(result.data.roundId);
          }
          if (staleRoundId) {
            migrateEmergencySave(staleRoundId, result.data.roundId, playerId, emergencyTimestamp);
            staleRoundId = null;
          }
          clearEmergencySaveThrough(savedRoundIdRef.current, playerId, emergencyTimestamp);
          return true;
        }
        if (result.error === 'conflict') {
          // B9: our own unreadable write moved the row — the token is
          // adopted, so re-send this same checkpoint under it.
          if (await handleRoundSyncConflict('This round was updated on another device. Please reload.')) continue;
          return false;
        }
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return false;
        }
        // The row is gone. Drop the id and let this same loop retry as a create
        // rather than breaking out to "this hole has not saved yet", which is
        // what left three auto-saves hammering a dead id at Winchester CC.
        if (result.error === 'round_missing') {
          // C1: the delete landed while this attempt was in flight — do not
          // drop the id and retry as a create, which would resurrect the
          // round the player just discarded.
          if (roundDiscardedRef.current) return false;
          staleRoundId = savedRoundIdRef.current;
          dropStaleRoundId();
          continue;
        }
        // B5: not a transient failure — the identical payload will keep
        // failing until the flagged hole/field is fixed, so retrying below
        // is pointless and "keep this screen open and try again" actively
        // misleads. Surface the specific sentence immediately and never
        // mark this hole checkpointed.
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

    // A direct hole-out checkpoint must keep the player on the hole and expose
    // a retry affordance. A background re-save of an already checkpointed hole
    // uses the same durable local snapshot, but must not manufacture a second
    // player-facing failure or a Sentry error while another save is coalescing.
    if (surfaceFailure) {
      consecutiveSaveFailuresRef.current++;
      setError('This hole has not saved yet. Keep this screen open and try again.');
      showAutoSaveWarning();
    }
    return false;
  }, [dropStaleRoundId, handleRoundSyncConflict, isCompletedRoundError, playerId, redirectToCompletedRound, savePartialRoundTracked, showAutoSaveWarning]);

  const handleHoleComplete = async (holeIndex: number, holeStats: HoleStats): Promise<boolean> => {
    const pendingCheckpoint = pendingHoleCheckpointRef.current;
    const isCheckpointRetry = pendingCheckpoint?.holeIndex === holeIndex;
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
      roundId: savedRoundIdRef.current,
      timestamp: emergencyTimestamp,
      setupData,
      holes: updatedHoles,
      completedHoleStats: updatedStats,
      inProgressShotsByHole: inProgressAfter,
      currentHoleIndex: isReEdit ? activeProgressHoleIndex : holeIndex + 1,
      holesPerRound,
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
    const allHolesScored = updatedStats.length === holes.length && updatedStats.every(s => s?.score != null);

    const decision = decidePostHoleCompleteAction({
      allHolesScored,
      isReEdit,
      holeIndex,
      totalHoles: holes.length,
    });
    switch (decision.type) {
      case 'finish':
        setPendingFinalStats(updatedStats);
        setShowFinishConfirm(true);
        break;
      case 'return-to-frontier':
        setCurrentHoleIndex(activeProgressHoleIndex);
        break;
      case 'advance':
        setCurrentHoleIndex(decision.nextHoleIndex);
        activeProgressHoleRef.current = decision.nextHoleIndex;
        break;
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
    const allHolesScored = updatedHoles.every((_, index) => updatedStats[index]?.score != null);
    if (allHolesScored) {
      // Keep an already-opened/dismissed finish prompt aligned with an edited
      // scorecard instead of submitting stale per-hole stats.
      setPendingFinalStats(updatedStats);
    } else {
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

    const currentInProgress = inProgressShotsByHoleRef.current;
    const existing = currentInProgress[currentHoleIndex] ?? [];
    const duplicateIndex = existing.findIndex((candidate) => candidate.shotNumber === shot.shotNumber);
    const updatedShots = duplicateIndex >= 0
      ? existing.map((candidate, index) => index === duplicateIndex ? shot : candidate)
      : [...existing, shot];
    const nextInProgress = { ...currentInProgress, [currentHoleIndex]: updatedShots };

    // A save interval is not a recovery guarantee. Write the complete shot
    // snapshot synchronously at the same moment the player records it, before
    // React renders or the 15s network autosave timer has a chance to run.
    inProgressShotsByHoleRef.current = nextInProgress;
    const onDevice = emergencySave({
      playerId,
      roundId: savedRoundIdRef.current,
      timestamp: Date.now(),
      setupData: setupDataRef.current,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: nextInProgress,
      currentHoleIndex,
      holesPerRound: holesPerRoundRef.current,
    });
    setInProgressShotsByHole(nextInProgress);
    // The save line says "Saved on this phone" only when this is true.
    return onDevice;
  };

  /**
   * Auto-save handler for shot tracking - persists to localStorage + database
   * This is called by ShotTrackingComprehensive after each shot entry
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Skip auto-save entirely if the round has been submitted or is being submitted
    if (isSubmittingRef.current || completedRoundId) return;
    // R-8: after Discard or Save for later nothing is written, not even the
    // device copy a debounce or retry timer would otherwise bring back.
    if (roundDiscardedRef.current || roundExitedSafelyRef.current) {
      throw new AutoSaveHeldError('discarded', false);
    }

    // Update the ref before React schedules its render. The synchronous backup
    // below needs a complete cross-hole snapshot, not a setState updater that
    // may run later in the event loop.
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
      roundId: savedRoundIdRef.current,
      timestamp: emergencyTimestamp,
      setupData: setupDataRef.current,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: allInProgressShots,
      currentHoleIndex: holeIndex,
      holesPerRound: holesPerRoundRef.current,
    });

    // Update pending counts in case there are any offline items
    await useOfflineSyncStore.getState().updatePendingCount();

    // B2: a prior conflict/staleness already proved this device is behind
    // the server. The localStorage backup above still ran, but writing to
    // the server now would replace the round with this device's outdated
    // snapshot — refuse until reload.
    // R-1: every return below that did not reach the server throws
    // AutoSaveHeldError, so the tracker says "on this device", not "saved",
    // and sends the same shots again.
    if (roundConflictBlockedRef.current) throw new AutoSaveHeldError('blocked', onDevice);
    // C1: the player discarded this round while the backup above ran — a
    // server write (including a round_missing re-create) must not resurrect it.
    if (roundDiscardedRef.current) throw new AutoSaveHeldError('discarded', false);
    if (!navigator.onLine && !probeConnectedRef.current) throw new AutoSaveHeldError('offline', onDevice);

    // Server save — awaited so the hook's circuit breaker can detect failures.
    // localStorage backup above already succeeded, so throwing here is safe and
    // lets the hook track consecutive failures to engage the circuit breaker.
    // (Always true past the offline guard above; it names the network branch.)
    if (navigator.onLine || probeConnectedRef.current) {
      // A completed-hole edit is another complete checkpoint, never an
      // in-progress duplicate. This keeps the scorecard and shot map in one
      // coherent server snapshot.
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
        if (!checkpointed) {
          throw new AutoSaveHeldError(
            roundDiscardedRef.current ? 'discarded' : roundConflictBlockedRef.current ? 'blocked' : 'busy',
            onDevice,
          );
        }
        return;
      }
      if (serverSaveInProgressRef.current) {
        // Queue this save — it will execute after the current one completes.
        // Not a server acknowledgement (R-1): held, and re-sent.
        pendingServerSaveRef.current = { shots, holeIndex, emergencyTimestamp };
        throw new AutoSaveHeldError('queued', onDevice);
      } else {
        serverSaveInProgressRef.current = true;
        try {
          const mergedInProgress = { ...inProgressShotsByHoleRef.current, [holeIndex]: shots };
          const result = await savePartialRoundTracked(
            buildPartialRoundData(undefined, holeIndex, mergedInProgress),
            savedRoundIdRef.current ?? undefined
          );
          if (result.success) {
            consecutiveSaveFailuresRef.current = 0;
            if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
            if (!savedRoundIdRef.current) {
              savedRoundIdRef.current = result.data.roundId;
              setSavedRoundId(result.data.roundId);
            }
            clearEmergencySaveThrough(savedRoundIdRef.current, playerId, emergencyTimestamp);
          } else if (result.error === 'conflict') {
            // A conflict is not an acknowledgement (see the continue engine):
            // healed is held and re-sent under the adopted token, otherwise
            // the round is blocked until a reload.
            const healed = await settleWithin(
              handleRoundSyncConflict('This round was updated on another device. Please reload.'),
              CONFLICT_CHECK_TIMEOUT_MS,
              true,
            );
            throw new AutoSaveHeldError(healed ? 'conflict' : 'blocked', onDevice);
          } else if (result.error === 'busy' || result.error === 'retry') {
            // Single-flight skip: another save for this round already holds the
            // row server-side (FOR UPDATE NOWAIT). Not a failure, so it must not
            // advance the circuit breaker or warn; held, so the tracker re-sends.
            throw new AutoSaveHeldError('busy', onDevice);
          } else if (isCompletedRoundError(result.error)) {
            redirectToCompletedRound();
          } else if (result.error === 'round_missing') {
            // C1: the delete landed while this save was in flight — re-creating
            // now would resurrect the round the player just discarded.
            if (roundDiscardedRef.current) throw new AutoSaveHeldError('discarded', false);
            // Re-create immediately with the same snapshot instead of throwing:
            // the circuit breaker must not open on a failure we can recover from.
            const staleRoundId = savedRoundIdRef.current;
            dropStaleRoundId();
            const recreated = await savePartialRound(
              buildPartialRoundData(undefined, holeIndex, mergedInProgress),
              undefined,
            );
            if (recreated.success) {
              consecutiveSaveFailuresRef.current = 0;
              if (recreated.data.updatedAt) lastServerUpdatedAtRef.current = recreated.data.updatedAt;
              savedRoundIdRef.current = recreated.data.roundId;
              setSavedRoundId(recreated.data.roundId);
              // The snapshot above was written under the dead id. Clearing
              // through the new id alone left that copy behind forever, and
              // New Round later offered it as recoverable against the dead id.
              migrateEmergencySave(staleRoundId, recreated.data.roundId, playerId, emergencyTimestamp);
              clearEmergencySaveThrough(recreated.data.roundId, playerId, emergencyTimestamp);
            } else {
              consecutiveSaveFailuresRef.current++;
              if (consecutiveSaveFailuresRef.current >= 2) showAutoSaveWarning();
              throw new Error(`Auto-save could not re-create the round: ${recreated.error}`);
            }
          } else if (result.error === 'hole_invalid') {
            // B5: not a transient network failure — the identical payload
            // will keep failing until the flagged hole/field is fixed, so
            // this must not throw into the circuit breaker (which exists
            // for outages, and would keep retrying a failure retrying can
            // never clear). Surface the specific sentence immediately.
            setError(describeRoundWriteResult(result));
            throw new AutoSaveHeldError('invalid', onDevice);
          } else {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showAutoSaveWarning();
            }
            // Throw so the hook's circuit breaker can track this failure
            throw new Error(`Auto-save server error: ${result.error}`);
          }
        } catch (err) {
          // A held save is not a failure: no count, no warning.
          if (isAutoSaveHeld(err)) throw err;
          consecutiveSaveFailuresRef.current++;
          if (consecutiveSaveFailuresRef.current >= 2) {
            showAutoSaveWarning();
          }
          // Re-throw so the hook's circuit breaker tracks the failure.
          // This is safe — localStorage backup already succeeded above.
          throw err;
        } finally {
          serverSaveInProgressRef.current = false;
          // If a newer save was queued while we were saving, fire-and-forget it.
          // This is a queued follow-up, not the primary save the hook is tracking.
          const pending = pendingServerSaveRef.current;
          if (pending) {
            pendingServerSaveRef.current = null;
            void (async () => {
              serverSaveInProgressRef.current = true;
              try {
                const mergedPending = { ...inProgressShotsByHoleRef.current, [pending.holeIndex]: pending.shots };
                const r = await savePartialRoundTracked(
                  buildPartialRoundData(undefined, pending.holeIndex, mergedPending),
                  savedRoundIdRef.current ?? undefined
                );
                if (r.success) {
                  consecutiveSaveFailuresRef.current = 0;
                  if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
                  if (!savedRoundIdRef.current) {
                    savedRoundIdRef.current = r.data.roundId;
                    setSavedRoundId(r.data.roundId);
                  }
                  clearEmergencySaveThrough(
                    savedRoundIdRef.current,
                    playerId,
                    pending.emergencyTimestamp ?? Date.now(),
                  );
                } else if (r.error === 'conflict') {
                  void handleRoundSyncConflict('This round was updated on another device. Please reload.');
                } else if (isCompletedRoundError(r.error)) {
                  redirectToCompletedRound();
                } else if (r.error === 'round_missing') {
                  // C1: dropping the id here arms the NEXT primary save to
                  // CREATE (`savedRoundIdRef.current` becomes `undefined`) —
                  // a deferred resurrection of a round the player just
                  // discarded, not an immediate one, but the same hazard.
                  if (!roundDiscardedRef.current) {
                    // Queued follow-up: just forget the id. The next primary save
                    // re-creates, and this one's state is already in that snapshot.
                    dropStaleRoundId();
                  }
                }
              } catch { /* queued save failure — non-critical, circuit breaker tracks primary saves */ } finally {
                serverSaveInProgressRef.current = false;
              }
            })();
          }
        }
      }
    }
  }, [
    backupOnDevice,
    buildPartialRoundData,
    completedRoundId,
    dropStaleRoundId,
    handleRoundSyncConflict,
    isCompletedRoundError,
    playerId,
    persistCompletedHole,
    redirectToCompletedRound,
    savePartialRoundTracked,
    showAutoSaveWarning,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    if (isSubmittingRef.current) return;
    // B2: never let a submit from a device already proven behind the
    // server replace the round with this device's outdated scorecard.
    if (roundConflictBlockedRef.current) {
      setError('This round was updated on another device. Please reload.');
      return;
    }
    isSubmittingRef.current = true;
    setStep('submitting');
    setError('');
    setQualifierClosed(false);

    // Clear any queued shot-level auto-save
    pendingServerSaveRef.current = null;

    try {
      const recoverySetupData = buildRecoverySetupData();

      // Save pre-submit snapshot to localStorage as insurance
      emergencySave({
        playerId,
        roundId: savedRoundIdRef.current,
        timestamp: Date.now(),
        setupData: recoverySetupData,
        holes,
        completedHoleStats: allHoleStats,
        inProgressShotsByHole: {},
        currentHoleIndex: holes.length - 1,
        holesPerRound,
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

      if (savedRoundIdRef.current && lastServerUpdatedAtRef.current) {
        try {
          const stalenessResult = await checkRoundStaleness(savedRoundIdRef.current, lastServerUpdatedAtRef.current);
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
                'This round was updated on another device. Please reload.',
                stalenessResult.data.currentUpdatedAt,
              );
              if (!healed) {
                isSubmittingRef.current = false;
                setStep('tracking');
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
        courseName: recoverySetupData.courseName,
        courseId: resolvedCourseIdRef.current || undefined,
        teeId: selectedTeeIdRef.current || undefined,
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

      // A `round_missing` answer means the server PROVED this id has no row
      // (it looked, and found nothing to duplicate). Re-submit the same
      // payload as a NEW round — the no-id branch creates and completes it in
      // one atomic call — instead of throwing the key at the overlay, which
      // is what rendered the literal string "round_missing" to players. If
      // the re-create fails too the result is a sentence, and the device
      // snapshot written above stays put for the recovery flow.
      const { result, recreated } = await writeRoundRecreatingIfMissing(
        submitGolfRoundComprehensive,
        roundData,
        savedRoundIdRef.current ?? undefined,
      );
      if (!result.success) {
        // C3: distinguish the qualifier-closed refusal from the round itself
        // being complete BEFORE the (now-narrowed) completed-round check —
        // the round stays `in_progress`, so redirecting to its detail page
        // would bounce straight back to the tracking step. Surface a
        // terminal message and a real way out (reclassify to practice)
        // instead of looping.
        if (isQualifierClosedError(result.error)) {
          setQualifierClosed(true);
          setError(result.error);
          isSubmittingRef.current = false;
          // Stay on 'submitting' so the overlay shows the message + action.
          return;
        }
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
        throw new Error(result.error);
      }

      // Clear local recovery state after successful submission. The snapshot
      // is keyed by the id it was written under — still the old one here.
      clearEmergencySave(savedRoundIdRef.current, playerId);
      if (recreated) {
        savedRoundIdRef.current = result.data.roundId;
        setSavedRoundId(result.data.roundId);
      }

      // Show success celebration — the overlay auto-navigates to round review
      // and owns the one signature success haptic (D-SUBMIT), timed to its
      // checkmark draw.
      setCompletedRoundId(result.data.roundId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit round';
      if (isRecoverableRoundSubmitError(message)) {
        await persistFailedSubmission(allHoleStats);
        isSubmittingRef.current = false;
        setStep('tracking');
        setError('');
        showToast('Round saved on this device. Opening recovery flow.', 'warning');
        startTransition(() => {
          router.push(routesRef.current.recover);
        });
        return;
      }

      void haptic('error');
      setError(message);
      isSubmittingRef.current = false;
      // Stay on submitting step so the overlay can show the error state
    }
  };

  /**
   * C3: the existing reclassify path (`updateRoundType` /
   * `reclassify_golf_round`, `src/app/golf/actions/round-type.ts`) already
   * supports an `in_progress` round — extended to do exactly that on
   * 2026-08-30 — it just had no client entry point while a round was still
   * being tracked. Converting to 'practice' clears `qualifier_id` /
   * `qualifier_round_number` server-side without touching `status`, so the
   * round can then be submitted normally.
   *
   * Updates local state and STOPS — it deliberately does not turn around and
   * call `handleRoundSubmit` itself with data patched in after the fact.
   * `handleRoundSubmit` reads `setupData`/`selectedQualifierId` fresh from
   * this render's closure every time it runs, so a state update here lands
   * correctly for the NEXT tap of the existing "Retry submit" control (a
   * brand-new closure, from a brand-new render) without any risk of the
   * stale-closure class of bug already recorded against this exact write
   * path (`savePartialRound`'s `ReferenceError: round is not defined`, see
   * round-missing-recovery.ts / shot-tracking.md, B9).
   */
  const handleSaveAsPractice = async () => {
    if (!savedRoundIdRef.current || reclassifying) return;
    setReclassifying(true);
    try {
      const result = await updateRoundType({ roundId: savedRoundIdRef.current, roundType: 'practice' });
      if (!result.success) {
        setError(result.error || 'Could not change this round to practice. Please try again.');
        return;
      }
      setSetupData(prev => ({ ...prev, roundType: 'practice' }));
      setSelectedQualifierId(null);
      setSelectedRoundNumber(null);
      setQualifierClosed(false);
      setError('');
      isSubmittingRef.current = false;
      setStep('tracking');
      showToast('Saved as a practice round.', 'success');
      // Re-show the finish confirm so the player can submit right away —
      // reading the setupData/selectedQualifierId this update just set.
      if (pendingFinalStats) {
        setShowFinishConfirm(true);
      }
    } catch {
      setError('Could not change this round to practice. Please try again.');
    } finally {
      setReclassifying(false);
    }
  };

  const handleSaveForLater = async () => {
    // B2: a user-initiated "Save & Exit" must not be the write that
    // overwrites another device's newer holes, either.
    if (roundConflictBlockedRef.current) {
      showToast('This round was updated on another device. Please reload.', 'error');
      return;
    }
    let result = await savePartialRoundTracked(buildPartialRoundData(), savedRoundId || undefined);

    // 'busy' = an auto-save for this round is mid-flight server-side. This is a
    // user-initiated save, so don't fail it on a coalescing skip — wait for the
    // in-flight save to release the row and try once more with current state.
    if (!result.success && (result.error === 'busy' || result.error === 'retry')) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      result = await savePartialRoundTracked(buildPartialRoundData(), savedRoundId || undefined);
    }

    // B9: a self-healed conflict (our own unreadable write moved the row)
    // adopts the token — re-send once under it. A genuine conflict blocks
    // and returns below.
    if (!result.success && result.error === 'conflict') {
      if (await handleRoundSyncConflict('This round was updated on another device. Please reload.')) {
        result = await savePartialRoundTracked(buildPartialRoundData(), savedRoundId || undefined);
      }
    }

    // A user-initiated save must not be the one that loses the round: if the id
    // is dead, re-create rather than reporting a failure the player cannot act on.
    // C1: unless the player discarded this exact round moments ago (the exit
    // modal's Save & Exit and Delete are two buttons in the same dialog) — in
    // that case re-creating would resurrect it.
    if (!result.success && result.error === 'round_missing' && !roundDiscardedRef.current && !wasRoundDiscarded(savedRoundId, playerId)) {
      dropStaleRoundId();
      result = await savePartialRoundTracked(buildPartialRoundData(), undefined);
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
      // A hole failed validation and nothing was written (A3). `result.error`
      // is the bare key 'hole_invalid', not a sentence — FairwaySaveRoundModal
      // renders whatever this throws verbatim, so surface the server's own
      // human message instead of the raw code.
      if (result.error === 'hole_invalid' && 'message' in result) {
        throw new Error(result.message);
      }
      throw new Error(result.error || 'Failed to save round. Please try again.');
    }

    savedRoundIdRef.current = result.data.roundId;
    setSavedRoundId(result.data.roundId);

    // Clear local recovery state only — the round itself was intentionally kept in the DB.
    clearEmergencySave(savedRoundIdRef.current, playerId);
    setShowExitModal(false);

    // Round is durable server-side as of the successful save above — an
    // unload/pagehide that coincides with this navigation must not warn or
    // re-save. Set before router.push (async; the listeners stay live until
    // the component actually unmounts).
    roundExitedSafelyRef.current = true;
    // No router.refresh() after the push (swap audit F-59): the refresh is bound to the library and, landing after a
    // quick tap on Continue, pulled the player back to it. The push already renders the library fresh (dynamic page,
    // no staleTimes override), as the continue engine's own Save for later does.
    router.push(routesRef.current.library);
  };

  const handleDeleteRound = async () => {
    if (savedRoundId) {
      // C1: mark BEFORE the delete call, not after it resolves — the window
      // this closes is between the delete request landing and any
      // concurrent save's response, so marking after would already be too
      // late for the race it exists to prevent.
      roundDiscardedRef.current = true;
      // Delete from database if it exists
      let result: Awaited<ReturnType<typeof deleteInProgressRound>>;
      try {
        result = await deleteInProgressRound(savedRoundId);
      } catch (error) {
        // R-3: a thrown discard (a dropped connection) leaves the round live
        // exactly as a refused one does. Only a refusal used to reset this,
        // so every later save and hole checkpoint was silently refused.
        roundDiscardedRef.current = false;
        throw error;
      }
      if (!result.success) {
        // The round is still live — a later round_missing for it is a real
        // anomaly, not this race, so re-creating should still be allowed.
        roundDiscardedRef.current = false;
        setError(result.error || 'Failed to delete round');
        setShowExitModal(false);
        return;
      }
      // R-4/R-10: no other tab may re-create it, and a failed-submit entry
      // queued for it must not sync it back.
      markRoundDiscarded(savedRoundId, playerId);
      forgetQueuedRound(savedRoundId);
    }

    // Clear local recovery state after successful server delete (or no server round)
    clearEmergencySave(savedRoundId, playerId);
    setShowExitModal(false);

    // The round is gone server-side — nothing left to warn about or re-save
    // on a coincident unload/pagehide. Same reasoning as handleSaveForLater.
    roundExitedSafelyRef.current = true;
    // Redirect to rounds page
    router.push(routesRef.current.library);
  };

  const selectedCourse = selectedCourseId
    ? savedCourses.find(course => course.id === selectedCourseId) || null
    : null;

  // Filtered courses for search
  const filteredSavedCourses = courseSearchQuery.trim()
    ? savedCourses.filter(c => {
        const q = courseSearchQuery.toLowerCase();
        return (
          c.courseName.toLowerCase().includes(q) ||
          (c.courseCity?.toLowerCase().includes(q) ?? false) ||
          (c.courseState?.toLowerCase().includes(q) ?? false) ||
          (c.teesPlayed?.toLowerCase().includes(q) ?? false)
        );
      })
    : savedCourses;

  // Dialog handlers for the recovery/reset flow — hoisted ABOVE the
  // setup/holes early return (B4) so the SAME recovery prompt can appear
  // there too, before persistRoundStart has ever created a server round.
  // The pre-fix version of this block lived only after the early return,
  // so a recovery snapshot detected on mount (before the player had even
  // reached the tracking step) could never actually be offered until the
  // player started a brand-new round from scratch — at which point
  // offering to "recover" the old one no longer made sense.
  const recoveredHoleCount =
    newRoundRecoveryData?.completedHoleStats?.filter(h => h != null).length || 0;
  const handleDiscardRecovery = () => {
    // B4: the recovered snapshot's OWN key — which can be a real server
    // round id once a round has survived past its first successful
    // auto-save (see loadLatestEmergencySave's docstring) — not a
    // hard-coded `_new_<playerId>`. Clearing the wrong key left the real
    // snapshot behind, where it resurfaced as "recoverable" again later.
    clearEmergencySave(newRoundRecoveryData?.roundId ?? null, playerId);
    setShowNewRoundRecovery(false);
    setNewRoundRecoveryData(null);
  };
  const handleRestoreRecovery = async () => {
    const rd = newRoundRecoveryData;
    if (!rd || isRestoringRecovery) return;
    setIsRestoringRecovery(true);
    const holesToPlay = rd.holes.length === 9 ? 9 : 18;
    const inProgressShots = Object.entries(rd.inProgressShotsByHole ?? {})
      .filter(([, shots]) => Array.isArray(shots) && shots.length > 0)
      .map(([holeIndex, shots]) => {
        const index = Number(holeIndex);
        return {
          holeNumber: rd.holes[index]?.number ?? index + 1,
          shots,
        };
      });
    const recoveryData: PartialRoundData = {
      courseName: rd.setupData.courseName,
      courseCity: rd.setupData.courseCity || undefined,
      courseState: rd.setupData.courseState || undefined,
      courseRating: rd.setupData.courseRating ? parseFloat(rd.setupData.courseRating) : undefined,
      courseSlope: rd.setupData.courseSlope ? parseInt(rd.setupData.courseSlope) : undefined,
      teesPlayed: rd.setupData.teesPlayed || undefined,
      roundType: rd.setupData.roundType,
      roundDate: rd.setupData.roundDate,
      qualifierId: rd.setupData.qualifierId || undefined,
      qualifierRoundNumber: rd.setupData.qualifierRoundNumber || undefined,
      currentHole: Math.max(1, Math.min(rd.currentHoleIndex + 1, holesToPlay)),
      holesToPlay,
      holes: rd.completedHoleStats.filter((hole): hole is HoleStats => hole != null),
      inProgressShots,
      holeConfigs: rd.holes.map((hole, index) => ({
        holeNumber: hole.number ?? index + 1,
        par: hole.par,
        yardage: hole.yardage,
      })),
    };

    try {
      // Restore through the server before reopening the tracker. This keeps
      // the Continue Round contract intact even when the original browser tab
      // was interrupted before its first background save could finish.
      // The snapshot may name a server id that has since vanished; the
      // helper re-creates from this same payload and never surfaces the key.
      //
      // `allowReuse: true` (A1) — this IS a real restore, not a plain "begin
      // new" call: when `rd.roundId` is unknown, the payload carries real
      // progress the player already has, and it should reconnect to a
      // matching in_progress round rather than always inserting a duplicate.
      // Never propagated to the round_missing re-create retry inside the
      // helper (see RoundWriteHooks.firstCallOptions) — that retry's intent
      // is CREATE, since the server already proved the given id is gone.
      const { result } = await writeRoundRecreatingIfMissing(
        savePartialRound,
        recoveryData,
        rd.roundId ?? undefined,
        { firstCallOptions: { allowReuse: true } },
      );
      if (!result.success) {
        setError(describeRoundWriteFailure(result.error));
        return;
      }

      clearEmergencySave(rd.roundId, playerId);
      setShowNewRoundRecovery(false);
      setNewRoundRecoveryData(null);
      router.push(routesRef.current.continueRound(result.data.roundId));
    } catch {
      setError('Unable to restore your saved shots. Keep this screen open and try again.');
    } finally {
      setIsRestoringRecovery(false);
    }
  };

  // Screen handlers that were inline in NewRoundClient: session logic (refs, steps, submit flags) a second renderer
  // would otherwise copy (ROUNDS_PLAN step 5a). Moved verbatim.

  // Back to setup from tracking: drops the round's holes, shots and server id, and keeps the chosen course (and any
  // cloud pick) so setup opens on the same course.
  const handleConfirmBackToSetup = () => {
    setShowBackToSetupModal(false);
    setCompletedHoleStats([]);
    setInProgressShotsByHole({});
    setCurrentHoleIndex(0);
    activeProgressHoleRef.current = 0;
    setSavedRoundId(null);
    savedRoundIdRef.current = null;
    setStep(preloadedHoleConfigs ? 'setup' : 'holes');
  };

  // "Change course" on the setup screen.
  const handleClearSelectedCourse = () => {
    setSelectedCourseId(null);
    setPreloadedHoleConfigs(null);
    // Clear any cloud-link so a subsequently hand-typed course can't inherit
    // a stale tee_id/course_id from the previously selected course.
    resolvedCourseIdRef.current = null;
    selectedTeeIdRef.current = null;
    setCloudPickActive(false);
    setPickedCourseImage(null);
    setSetupData((prev) => ({
      ...prev,
      courseName: '',
      courseCity: '',
      courseState: '',
      courseRating: '',
      courseSlope: '',
      teesPlayed: 'White',
    }));
  };

  // The saved / new course toggle on the setup screen.
  const handleCourseModeChange = (next: 'new' | 'saved') => {
    if (next === 'saved') {
      setCourseMode('saved');
      setCourseSearchQuery('');
      if (!selectedCourseId && savedCourses.length > 0) {
        handleSavedCourseSelect(savedCourses[0]!.id);
      }
    } else {
      setCourseMode('new');
      setSelectedCourseId(null);
      resolvedCourseIdRef.current = null;
      selectedTeeIdRef.current = null;
      setCloudPickActive(false);
      setPickedCourseImage(null);
      setPreloadedHoleConfigs(null);
      setCourseSearchQuery('');
      setSetupData((prev) => ({
        ...prev,
        courseName: '',
        courseCity: '',
        courseState: '',
        courseRating: '',
        courseSlope: '',
        teesPlayed: 'White',
      }));
    }
  };

  // The submit overlay's actions. Each one clears the submit flag the overlay's screen was holding, so no renderer
  // has to know `isSubmittingRef` exists.
  const handleSubmitGoBack = () => {
    setError('');
    setQualifierClosed(false);
    isSubmittingRef.current = false;
    setStep('tracking');
    // Always re-show the finish confirm so user can submit again
    if (pendingFinalStats) {
      setShowFinishConfirm(true);
    }
  };
  const handleSubmitRetry = () => {
    setError('');
    isSubmittingRef.current = false;
    if (pendingFinalStats) void handleRoundSubmit(pendingFinalStats);
  };
  const handleSubmitSaveAndExit = async () => {
    setError('');
    isSubmittingRef.current = false;
    await handleSaveForLater();
  };
  const handleSubmitDiscard = async () => {
    setError('');
    isSubmittingRef.current = false;
    await handleDeleteRound();
  };

  return {
    router,
    connectionStatus,
    showOfflineWarning,
    setShowOfflineWarning,
    step,
    setStep,
    setupData,
    setSetupData,
    currentHoleIndex,
    setCurrentHoleIndex,
    holes,
    completedHoleStats,
    setCompletedHoleStats,
    error,
    setError,
    showExitModal,
    setShowExitModal,
    setSavedRoundId,
    inProgressShotsByHole,
    setInProgressShotsByHole,
    holesPerRound,
    setHolesPerRound,
    isSubmittingRef,
    savedRoundIdRef,
    isStartingRound,
    roundConflictBlocked,
    pendingFinalStats,
    showFinishConfirm,
    setShowFinishConfirm,
    showBackToSetupModal,
    setShowBackToSetupModal,
    completedRoundId,
    qualifierClosed,
    setQualifierClosed,
    activeProgressHoleRef,
    maxRoundDate,
    showNewRoundRecovery,
    setShowNewRoundRecovery,
    newRoundRecoveryData,
    isRestoringRecovery,
    qualifiers,
    allActiveQualifiers,
    loadingQualifiers,
    loadingActiveQualifiers,
    selectedQualifierId,
    setSelectedQualifierId,
    selectedRoundNumber,
    setSelectedRoundNumber,
    availableRounds,
    qualifierError,
    qualifierRoundError,
    savedCourses,
    loadingSavedCourses,
    recentCourses,
    courseMode,
    setCourseMode,
    selectedCourseId,
    setSelectedCourseId,
    resolvedCourseIdRef,
    selectedTeeIdRef,
    inProgressConflict,
    setInProgressConflict,
    conflictActionBusy,
    discardConfirming,
    setDiscardConfirming,
    cloudPickActive,
    setCloudPickActive,
    pickedCourseImage,
    setPickedCourseImage,
    teePickerOpen,
    setTeePickerOpen,
    preloadedHoleConfigs,
    setPreloadedHoleConfigs,
    saveCourseChecked,
    setSaveCourseChecked,
    courseSearchQuery,
    setCourseSearchQuery,
    nineSelection,
    setNineSelection,
    loadQualifiers,
    retryQualifierRound,
    handleQuickPickConfirm,
    handleTeePick,
    handleSavedCourseSelect,
    handleClearSelectedCourse,
    handleCourseModeChange,
    persistRoundStart,
    start,
    handleConflictResume,
    handleConflictConfirmDiscard,
    handleConflictStartNewRound,
    handleSetupSubmit,
    handleConfirmedHolesSave,
    handleHoleComplete,
    handleHoleStatsUpdate,
    handleSaveShot,
    handleAutoSave,
    handleRoundSubmit,
    handleSaveAsPractice,
    handleSaveForLater,
    handleDeleteRound,
    selectedCourse,
    filteredSavedCourses,
    recoveredHoleCount,
    handleDiscardRecovery,
    handleRestoreRecovery,
    handleConfirmBackToSetup,
    handleSubmitGoBack,
    handleSubmitRetry,
    handleSubmitSaveAndExit,
    handleSubmitDiscard,
  };
}
