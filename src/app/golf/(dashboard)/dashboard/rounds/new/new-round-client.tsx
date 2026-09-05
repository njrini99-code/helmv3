'use client';

import { startTransition, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import { contributeCourseFromRound, type TeeRoundDefaults } from '@/app/golf/actions/course-library';
import { checkRoundStaleness, type TerminalRoundSubmissionData } from '@/app/golf/actions/round-drafts';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { useOfflineSyncStore, useOfflineSyncStatus } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { saveOfflineRound } from '@/lib/offline/indexed-db';
import { beaconPartialSave } from '@/lib/offline/partial-save-beacon';
import { OfflineWarningBanner } from '@/components/golf';
import { IconWarning } from '@/components/icons';
import { useToast } from '@/components/ui/sonner';
import { triggerHaptic } from '@/lib/utils/capacitor';
// DraftIndicator removed - was too noisy
import type { HoleConfig } from '@/lib/types/golf-course';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import {
  emergencySave,
  loadLatestEmergencySave,
  clearEmergencySave,
  clearEmergencySaveThrough,
  isRecoverableRoundSubmitError,
  migrateEmergencySave,
  EMERGENCY_SAVE_DEGRADED_EVENT,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';
import {
  describeRoundWriteFailure,
  describeRoundWriteResult,
  isUnrecoverableRoundWriteFailure,
  isAutoSaveStoppedFailure,
  writeRoundRecreatingIfMissing,
  isQualifierClosedError,
} from '@/lib/golf/round-missing-recovery';
import { updateRoundType } from '@/app/golf/actions/round-type';
import { getRoundRecoverySnapshots } from '@/lib/offline/shot-storage';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayNewRoundEntry } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';
import { Button as FwButton } from '@/components/fairway/controls/button';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { localDayIso } from '@/lib/golf/local-day';

// Round-completion-only overlays — never rendered until the round is
// finished, so keep them out of the initial hole-entry bundle (perf audit
// 2026-07-09, bundle finding 4). Same no-ssr-flag, .then((m) => m.X) pattern
// as FairwayCalendar.tsx's CalendarFeedManager.
const FairwaySaveRoundModal = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwaySaveRoundModal').then((m) => m.FairwaySaveRoundModal),
);
const FairwayRoundSubmitOverlay = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSubmitOverlay').then((m) => m.FairwayRoundSubmitOverlay),
);
const FairwayRoundSummarySheet = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSummarySheet').then((m) => m.FairwayRoundSummarySheet),
);

type Hole = RoundHole;

interface RoundSetupForm {
  courseName: string;
  courseCity: string;
  courseState: string;
  courseRating: string;
  courseSlope: string;
  teesPlayed: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
}

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

interface NewRoundClientProps {
  playerId: string;
}

export default function NewRoundClient({ playerId }: NewRoundClientProps) {
  const ExitRoundModal = FairwaySaveRoundModal;
  const SubmitOverlay = FairwayRoundSubmitOverlay;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  // Unfinished rounds are surfaced on the /rounds page (UnfinishedRoundsSection),
  // not as a gate here — starting a New Round lands straight on the course
  // carousel. There is no in-flow resume prompt (the old prompt state was never
  // reachable), so this page no longer fetches the in-progress round.

  // Hide mobile bottom nav for entire round flow (setup → holes → tracking → submit)
  const { hide: hideMobileNav, show: showMobileNav } = useMobileNav();
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
  // Fired at most once per round: server saving has stopped for a reason no
  // retry can clear (see isAutoSaveStoppedFailure). Without this guard the
  // toast would re-fire on every shot the player enters afterwards, since the
  // auto-save effect re-runs on each shot change and re-hits the same refusal.
  const autoSaveStoppedNotifiedRef = useRef(false);
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
  // B9: true from the moment a background beacon save is queued until the
  // next status check resolves it — see the matching ref in
  // continue-round-client.tsx for the full "beacon has no readable
  // response" reasoning.
  const pendingBeaconRef = useRef(false);
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
      router.replace(`/golf/dashboard/rounds/${targetRoundId}`);
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

  const handleRoundSyncConflict = useCallback(async (
    fallbackMessage: string,
    knownCurrentUpdatedAt?: string | null,
  ) => {
    const roundId = savedRoundIdRef.current;
    if (!roundId) {
      // No server round exists yet at all — nothing to reconcile against,
      // and nothing to block (the next persistRoundStart is the only write).
      setError(fallbackMessage);
      showToast(fallbackMessage, 'error');
      return;
    }

    // B9: a background beacon has no readable response, so its own
    // successful write is indistinguishable from a genuine multi-device
    // conflict until this next check. Treat exactly one apparent conflict
    // after a pending beacon as self-caused rather than escalating to a
    // permanent write-block on a single device that simply had its phone
    // lock — see the matching comment in continue-round-client.tsx.
    if (pendingBeaconRef.current) {
      pendingBeaconRef.current = false;
      if (knownCurrentUpdatedAt) {
        lastServerUpdatedAtRef.current = knownCurrentUpdatedAt;
        return;
      }
      try {
        const stalenessResult = await checkRoundStaleness(roundId, lastServerUpdatedAtRef.current);
        if (stalenessResult.success) {
          if (stalenessResult.data.status === 'completed') {
            redirectToCompletedRound();
            return;
          }
          if (stalenessResult.data.currentUpdatedAt) {
            lastServerUpdatedAtRef.current = stalenessResult.data.currentUpdatedAt;
          }
        }
      } catch {
        // Nothing more to do — a real write attempt will surface a fresh
        // conflict (and re-enter this function) if this guess was wrong.
      }
      return;
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
        return;
      }
    } catch {
      // Fall through to the generic conflict message below.
    }

    blockRoundForConflict(fallbackMessage);
  }, [blockRoundForConflict, redirectToCompletedRound, showToast]);

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
      };
      // Unload-safe: a plain `void savePartialRound(...)` server-action fetch is
      // killed when the page freezes (phone lock / app switch), so the round
      // never reaches the server and can't be resumed. sendBeacon is guaranteed
      // to deliver during unload. The synchronous emergencySave above is the
      // hard fallback if even the beacon can't be queued.
      if (beaconPartialSave(saveData, savedRoundIdRef.current ?? undefined)) {
        // B9: this write's response is unreadable — see pendingBeaconRef above.
        pendingBeaconRef.current = true;
      }
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
  // Reactive mirror of "a cloud tee is selected" (selectedTeeIdRef is a ref and
  // can't drive render). Kept in lockstep with selectedTeeIdRef so the setup
  // screen can show a read-only "Course ready" confirmation for a cloud pick
  // instead of an editable form — editing the form would otherwise persist the
  // edited name against the original (now-mismatched) tee_id/course_id.
  const [cloudPickActive, setCloudPickActive] = useState(false);
  // Course imagery for the confirm screen, carried out of the picker with the
  // tee (FairwayCoursePicker already had the golf_courses row in hand). Null on
  // every non-cloud path, where CourseImage falls back to its name-derived photo.
  const [pickedCourseImage, setPickedCourseImage] = useState<{
    imageUrl: string | null;
    normalizedName: string | null;
  } | null>(null);
  const [teePickerOpen, setTeePickerOpen] = useState(false);
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
        if (err.message?.includes('not found on the server') || err.message?.includes('Server Action')) {
          window.location.reload();
          return;
        }
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
              router.replace(`/golf/dashboard/rounds/continue/${result.data.activeRoundId}`);
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
          if (err.message?.includes('not found on the server') || err.message?.includes('Server Action')) {
            window.location.reload();
            return;
          }
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
        if (err.message?.includes('not found on the server') || err.message?.includes('Server Action')) {
          window.location.reload();
          return;
        }
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

    // Advance straight into the round flow. We mirror the gating logic
    // from handleSetupSubmit so behavior stays identical.
    const hasValidYardages = course.holeConfigs?.some(h => h.yardage > 0) ?? false;
    if (course.holeConfigs && course.holeConfigs.length > 0 && hasValidYardages) {
      const targetCount = course.holesPerRound === 9 ? 9 : 18;
      const configs: SavedCourseHoleConfig[] = course.holeConfigs.slice(0, targetCount);
      const initialHoles: Hole[] = configs.map((h, idx) => ({
        number: idx + 1,
        par: h.par,
        yardage: h.yardage,
        score: null,
      }));
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setStep('tracking');
    } else {
      // No usable hole configs — go to the configuration step with what we have
      setStep('holes');
    }
  }, []);

  /**
   * Start from the Cloud Course Library tee picker: populate the setup form +
   * per-hole defaults from the chosen tee, and record the tee id so the round
   * links to golf_rounds.tee_id. The round still snapshots its own holes — the
   * tee only seeds defaults. We leave the user on the setup screen to confirm.
   */
  const handleTeePick = useCallback((d: TeeRoundDefaults) => {
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
  }, []);

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
    if (nothingChosenYet) setTeePickerOpen(true);
  }, [step, selectedCourseId, setupData.courseName, connectionStatus.isOnline]);

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
   * Everything that must be true before a round can start, independent of
   * WHICH control starts it. Returns the user-facing error, or null to proceed.
   *
   * EXTRACTED 2026-07-25 and this is load-bearing, not tidying. These checks
   * used to live only inside `handleSetupSubmit`, and the confirm screen
   * reached them because a course pick with usable holes routed through the
   * form's submit button. The confirm screen now starts the round from the
   * hole editor's own "Start round" button instead — which never touches
   * `onSubmit`. Without this shared gate, a player who switched Round type to
   * "Qualifier" on the confirm screen and left the qualifier unpicked could
   * start a round that no qualifier owns.
   */
  const validateBeforeStart = useCallback((): string | null => {
    if (!setupData.courseName) return 'Please enter a course name';
    if (setupData.roundType === 'qualifier') {
      if (!selectedQualifierId) return 'Please select a qualifier';
      if (!selectedRoundNumber) return 'Please select which round of the qualifier this is';
    }
    // Ranges mirror the server Zod schema in golf.ts — keep them in step.
    if (setupData.courseRating) {
      const rating = parseFloat(setupData.courseRating);
      if (isNaN(rating) || rating < 50 || rating > 85) {
        return 'Course rating must be between 50.0 and 85.0';
      }
    }
    if (setupData.courseSlope) {
      const slope = parseInt(setupData.courseSlope);
      if (isNaN(slope) || slope < 55 || slope > 155) {
        return 'Course slope must be between 55 and 155';
      }
    }
    // B7: only the terminal submit path (golf.ts) rejected a future round
    // date — by which point an entire round had already been tracked under
    // the wrong day. This is the one gate both round-start entry points
    // (handleSetupSubmit, handleConfirmedHolesSave) share, so catching it
    // here blocks it before persistRoundStart ever creates the round.
    if (setupData.roundDate && setupData.roundDate > localDayIso()) {
      return 'Round date cannot be in the future.';
    }
    return null;
  }, [setupData, selectedQualifierId, selectedRoundNumber]);

  /**
   * Establish the durable parent before a player can record a shot. This is
   * the Continue Round contract: a started round is already an in-progress
   * server row, never a browser-only attempt that depends on a later autosave.
   */
  const persistRoundStart = useCallback(async (
    initialHoles: Hole[],
    configuredHoles: HoleConfig[],
  ): Promise<boolean> => {
    const initialData: PartialRoundData = {
      courseName: setupData.courseName,
      courseId: resolvedCourseIdRef.current || undefined,
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

    if (!navigator.onLine) {
      setError('Connect to the internet before starting so this round can be saved and resumed.');
      return false;
    }

    try {
      const result = await savePartialRound(initialData);
      if (!result.success) {
        // B6: this call always sends `holes: []` (a fresh round), so
        // `conflict`/`round_missing`/`hole_invalid` cannot occur here — but
        // `busy`/`retry` can, and both are bare signal keys, not sentences.
        setError(describeRoundWriteFailure(result.error));
        return false;
      }

      savedRoundIdRef.current = result.data.roundId;
      setSavedRoundId(result.data.roundId);
      if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setInProgressShotsByHole({});
      setCurrentHoleIndex(0);
      activeProgressHoleRef.current = 0;
      emergencySave({
        playerId,
        roundId: result.data.roundId,
        timestamp: Date.now(),
        setupData,
        holes: initialHoles,
        completedHoleStats: [],
        inProgressShotsByHole: {},
        currentHoleIndex: 0,
        holesPerRound: configuredHoles.length as 9 | 18,
      });
      return true;
    } catch {
      setError('Unable to save this round. Please try again before tracking.');
      return false;
    }
  }, [playerId, selectedQualifierId, selectedRoundNumber, setupData]);

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
      const initialHoles: Hole[] = configs.map((h, idx) => ({
        number: idx + 1, // Renumber 1-9 regardless of front/back
        par: h.par,
        yardage: h.yardage,
        score: null,
      }));
      const persisted = await persistRoundStart(initialHoles, configs);
      if (!persisted) {
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
    const validationError = validateBeforeStart();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setIsStartingRound(true);
    await handleHolesSave(configuredHoles);
  };

  const handleHolesSave = async (configuredHoles: HoleConfig[]) => {
    // Convert HoleConfig to Hole format
    const initialHoles: Hole[] = configuredHoles.map((h) => ({
      number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    const persisted = await persistRoundStart(initialHoles, configuredHoles);
    if (!persisted) {
      setIsStartingRound(false);
      return;
    }

    // Save course configuration if user opted in
    if (saveCourseChecked && setupData.courseName) {
      const holeConfigs: SavedCourseHoleConfig[] = configuredHoles.map((h) => ({
        holeNumber: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
      }));

      const result = await savePlayerCourse({
        courseName: setupData.courseName,
        courseCity: setupData.courseCity || undefined,
        courseState: setupData.courseState || undefined,
        courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : undefined,
        courseSlope: setupData.courseSlope ? parseInt(setupData.courseSlope) : undefined,
        teesPlayed: setupData.teesPlayed || undefined,
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
            courseName: setupData.courseName,
            city: setupData.courseCity || null,
            state: setupData.courseState || null,
            teeName: setupData.teesPlayed || null,
            courseRating: setupData.courseRating ? parseFloat(setupData.courseRating) : null,
            slopeRating: setupData.courseSlope ? parseInt(setupData.courseSlope) : null,
            holes: holeConfigs.map(h => ({ holeNumber: h.holeNumber, par: h.par, yardage: h.yardage })),
          });
          if (contrib.success) {
            resolvedCourseIdRef.current = contrib.data.courseId;
            if (contrib.data.teeId) selectedTeeIdRef.current = contrib.data.teeId;
          }
        } catch { /* best-effort: catalog growth must never block the round */ }
      }
    }

    setStep('tracking');
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
        const result = await savePartialRound(saveData, savedRoundIdRef.current ?? undefined);
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
          await handleRoundSyncConflict('This round was updated on another device. Please reload.');
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
  }, [dropStaleRoundId, handleRoundSyncConflict, isCompletedRoundError, playerId, redirectToCompletedRound, showAutoSaveWarning]);

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
    emergencySave({
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
  };

  /**
   * Auto-save handler for shot tracking - persists to localStorage + database
   * This is called by ShotTrackingComprehensive after each shot entry
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Skip auto-save entirely if the round has been submitted or is being submitted
    if (isSubmittingRef.current || completedRoundId) return;

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
    emergencySave({
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
    if (roundConflictBlockedRef.current) return;
    // C1: the player discarded this round — the localStorage backup above
    // still ran, but a server write (including a round_missing re-create)
    // must not resurrect it.
    if (roundDiscardedRef.current) return;

    // Server save — awaited so the hook's circuit breaker can detect failures.
    // localStorage backup above already succeeded, so throwing here is safe and
    // lets the hook track consecutive failures to engage the circuit breaker.
    if (navigator.onLine) {
      // A completed-hole edit is another complete checkpoint, never an
      // in-progress duplicate. This keeps the scorecard and shot map in one
      // coherent server snapshot.
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
        // Queue this save — it will execute after the current one completes.
        // Don't throw here: the queued save will be picked up after the in-flight one finishes.
        pendingServerSaveRef.current = { shots, holeIndex, emergencyTimestamp };
      } else {
        serverSaveInProgressRef.current = true;
        try {
          const mergedInProgress = { ...inProgressShotsByHoleRef.current, [holeIndex]: shots };
          const result = await savePartialRound(
            buildPartialRoundData(undefined, holeIndex, mergedInProgress),
            savedRoundIdRef.current ?? undefined
          );
          if (result.success) {
            consecutiveSaveFailuresRef.current = 0;
            // Saving RECOVERED (the player signed back in, say). Re-arm the
            // stopped-saving warning: without this the ref latches for the life of
            // the round, so a session that drops a second time stops saving in
            // silence, with only an inline error the player may already have
            // dismissed. The player is told once EACH TIME saving stops.
            autoSaveStoppedNotifiedRef.current = false;
            if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
            if (!savedRoundIdRef.current) {
              savedRoundIdRef.current = result.data.roundId;
              setSavedRoundId(result.data.roundId);
            }
            clearEmergencySaveThrough(savedRoundIdRef.current, playerId, emergencyTimestamp);
          } else if (result.error === 'conflict') {
            void handleRoundSyncConflict('This round was updated on another device. Please reload.');
          } else if (result.error === 'busy' || result.error === 'retry') {
            // Single-flight skip: another save for this round already holds the
            // row server-side (FOR UPDATE NOWAIT). Not a failure — the next
            // tick re-sends the full state — so it must not advance the
            // circuit breaker, warn, or throw.
          } else if (isCompletedRoundError(result.error)) {
            redirectToCompletedRound();
          } else if (result.error === 'round_missing') {
            // C1: the delete landed while this save was in flight — re-creating
            // now would resurrect the round the player just discarded.
            if (roundDiscardedRef.current) return;
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
          } else if (isUnrecoverableRoundWriteFailure(result)) {
            // B5, widened 2026-09-04. Not a transient network failure: the
            // identical payload will keep failing until the cause is fixed, and
            // for a missing session or a missing player profile it cannot be
            // fixed mid-round at all. So this must not throw into the circuit
            // breaker, which exists for outages and would otherwise retry at
            // 5s/15s/30s and then probe every 60 seconds for the rest of the
            // round - re-failing and re-logging identically every time.
            // Surface the specific sentence immediately instead.
            const sentence = describeRoundWriteResult(result);
            setError(sentence);
            if (isAutoSaveStoppedFailure(result) && !autoSaveStoppedNotifiedRef.current) {
              // Server saving has STOPPED, not slowed - showAutoSaveWarning's
              // "sync may be delayed" would be untrue here. The player is looking
              // at the course, so say it once, plainly, in a toast.
              autoSaveStoppedNotifiedRef.current = true;
              showToast(sentence, 'error');
            }
          } else {
            consecutiveSaveFailuresRef.current++;
            if (consecutiveSaveFailuresRef.current >= 2) {
              showAutoSaveWarning();
            }
            // Throw so the hook's circuit breaker can track this failure
            throw new Error(`Auto-save server error: ${result.error}`);
          }
        } catch (err) {
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
                const r = await savePartialRound(
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
    showToast,
    buildPartialRoundData,
    completedRoundId,
    dropStaleRoundId,
    handleRoundSyncConflict,
    isCompletedRoundError,
    playerId,
    persistCompletedHole,
    redirectToCompletedRound,
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
              setStep('tracking');
              return;
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
      void triggerHaptic('success');
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
          router.push('/golf/dashboard/rounds/recover?from=submit');
        });
        return;
      }

      void triggerHaptic('error');
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
    let result = await savePartialRound(buildPartialRoundData(), savedRoundId || undefined);

    // 'busy' = an auto-save for this round is mid-flight server-side. This is a
    // user-initiated save, so don't fail it on a coalescing skip — wait for the
    // in-flight save to release the row and try once more with current state.
    if (!result.success && (result.error === 'busy' || result.error === 'retry')) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      result = await savePartialRound(buildPartialRoundData(), savedRoundId || undefined);
    }

    // A user-initiated save must not be the one that loses the round: if the id
    // is dead, re-create rather than reporting a failure the player cannot act on.
    // C1: unless the player discarded this exact round moments ago (the exit
    // modal's Save & Exit and Delete are two buttons in the same dialog) — in
    // that case re-creating would resurrect it.
    if (!result.success && result.error === 'round_missing' && !roundDiscardedRef.current) {
      dropStaleRoundId();
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
    router.push('/golf/dashboard/rounds');
    router.refresh();
  };

  const handleDeleteRound = async () => {
    if (savedRoundId) {
      // C1: mark BEFORE the delete call, not after it resolves — the window
      // this closes is between the delete request landing and any
      // concurrent save's response, so marking after would already be too
      // late for the race it exists to prevent.
      roundDiscardedRef.current = true;
      // Delete from database if it exists
      const result = await deleteInProgressRound(savedRoundId);
      if (!result.success) {
        // The round is still live — a later round_missing for it is a real
        // anomaly, not this race, so re-creating should still be allowed.
        roundDiscardedRef.current = false;
        setError(result.error || 'Failed to delete round');
        setShowExitModal(false);
        return;
      }
    }

    // Clear local recovery state after successful server delete (or no server round)
    clearEmergencySave(savedRoundId, playerId);
    setShowExitModal(false);

    // The round is gone server-side — nothing left to warn about or re-save
    // on a coincident unload/pagehide. Same reasoning as handleSaveForLater.
    roundExitedSafelyRef.current = true;
    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
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
      router.push(`/golf/dashboard/rounds/continue/${result.data.roundId}`);
    } catch {
      setError('Unable to restore your saved shots. Keep this screen open and try again.');
    } finally {
      setIsRestoringRecovery(false);
    }
  };

  // Shared across BOTH the setup/holes return below and the tracking-step
  // return further down, so the SAME recovery prompt renders regardless of
  // which step the player is on when a recoverable snapshot is found (B4).
  const recoveryDialog = (
    <ModalShell
      open={Boolean(showNewRoundRecovery && newRoundRecoveryData)}
      onOpenChange={(next) => {
        if (!next) setShowNewRoundRecovery(false);
      }}
      size="sm"
      title="Recover Unsaved Progress?"
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-fw-md bg-fw-warning-bg">
          <IconWarning size={24} className="text-fw-warning-ink" />
        </div>
        <h2 className="mb-2 text-center font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">
          Recover Unsaved Progress?
        </h2>
        <p className="mb-6 text-center font-fw-sans text-sm text-text-tertiary">
          {recoveredHoleCount > 0
            ? `Found locally saved data with ${recoveredHoleCount} completed ${recoveredHoleCount === 1 ? 'hole' : 'holes'}.`
            : 'Found shots saved locally for a hole in progress.'}{' '}
          This data may have been saved when the app was interrupted.
        </p>
        <div className="flex gap-3">
          <FwButton variant="secondary" className="flex-1" onClick={handleDiscardRecovery} disabled={isRestoringRecovery}>
            Discard
          </FwButton>
          <FwButton variant="primary" className="flex-1" onClick={handleRestoreRecovery} disabled={isRestoringRecovery}>
            {isRestoringRecovery ? 'Restoring…' : 'Restore'}
          </FwButton>
        </div>
      </div>
    </ModalShell>
  );

  // ============================================================================
  // ENTRY SCREENS (setup + holes) — the tracking and submitting steps fall
  // through to the render below. No mutation/autosave/optimistic-lock logic
  // moves; this is presentation only. The resume prompt is never shown here
  // (it lives on /rounds), so the entry component doesn't carry any
  // resume-gate props or a discarded query.
  // ============================================================================
  if (step === 'setup' || step === 'holes') {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayNewRoundEntry
          step={step}
          onBrowseCourseLibrary={() => setTeePickerOpen(true)}
          recentCourses={recentCourses}
          onQuickPickConfirm={handleQuickPickConfirm}
          isOnline={connectionStatus.isOnline}
          loadingSavedCourses={loadingSavedCourses}
          savedCourses={savedCourses}
          filteredSavedCourses={filteredSavedCourses}
          courseMode={courseMode}
          onCourseModeChange={(next) => {
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
          }}
          courseSearchQuery={courseSearchQuery}
          setCourseSearchQuery={setCourseSearchQuery}
          selectedCourseId={selectedCourseId}
          onSavedCourseSelect={handleSavedCourseSelect}
          selectedCourse={selectedCourse}
          cloudPickActive={cloudPickActive}
          pickedCourseImage={pickedCourseImage}
          onClearSelectedCourse={() => {
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
          }}
          setupData={setupData}
          setSetupData={setSetupData}
          maxRoundDate={maxRoundDate}
          saveCourseChecked={saveCourseChecked}
          onToggleSaveCourse={() => setSaveCourseChecked(!saveCourseChecked)}
          holesPerRound={holesPerRound}
          setHolesPerRound={setHolesPerRound}
          preloadedHoleConfigs={preloadedHoleConfigs}
          nineSelection={nineSelection}
          setNineSelection={setNineSelection}
          allActiveQualifiers={allActiveQualifiers}
          loadingActiveQualifiers={loadingActiveQualifiers}
          onPickActiveQualifier={(q) => {
            setSetupData((prev) => ({ ...prev, roundType: 'qualifier' }));
            setSelectedQualifierId(q.id);
          }}
          qualifiers={qualifiers}
          loadingQualifiers={loadingQualifiers}
          qualifierError={qualifierError}
          onRetryQualifiers={loadQualifiers}
          selectedQualifierId={selectedQualifierId}
          setSelectedQualifierId={setSelectedQualifierId}
          qualifierRoundError={qualifierRoundError}
          onRetryQualifierRound={retryQualifierRound}
          availableRounds={availableRounds}
          selectedRoundNumber={selectedRoundNumber}
          setSelectedRoundNumber={setSelectedRoundNumber}
          error={error}
          isStartingRound={isStartingRound}
          onSubmit={handleSetupSubmit}
          onCancel={() => router.back()}
          onExitToDashboard={() => router.push('/golf/dashboard')}
          onHolesSave={handleConfirmedHolesSave}
          onHolesBack={() => setStep('setup')}
        />
        <FairwayCoursePicker open={teePickerOpen} onOpenChange={setTeePickerOpen} onPick={handleTeePick} />
        {/* B4: offered here too — before a server round has ever been
            created — not only once the player has already started tracking
            a brand-new round. */}
        {recoveryDialog}
      </div>
    );
  }


  // Submitting overlay stats (computed once, used by overlay)
  const submittingTotalScore = completedHoleStats.reduce((sum, h) => sum + (h?.score ?? 0), 0);
  const submittingTotalPar = completedHoleStats.reduce((sum, h) => sum + (h?.par ?? 0), 0);
  const submittingToPar = submittingTotalScore - submittingTotalPar;

  // ============================================================================
  // TRACKING STEP
  // ============================================================================
  const completedStatsForHole = completedHoleStats[currentHoleIndex];
  const inProgressShots = inProgressShotsByHole[currentHoleIndex] ?? [];
  const activeHoleShots = completedStatsForHole?.shots ?? inProgressShots;
  const activeShotNumber = activeHoleShots.length > 0 ? activeHoleShots.length + 1 : 1;

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

  return (
    <>
      {/* Submit banner — shown when all holes are done but finish confirm was dismissed */}
      {pendingFinalStats && !showFinishConfirm && step === 'tracking' && (
        <div className={fairwayScope('sticky top-[var(--golf-mobile-header-offset)] z-20 flex items-center justify-between gap-3 bg-accent-600 px-4 py-3 text-text-on-accent lg:top-[49px]')}>
          <p className="font-fw-sans text-sm font-medium">All holes completed — ready to submit!</p>
          <FwButton
            variant="secondary"
            size="sm"
            onClick={() => setShowFinishConfirm(true)}
            className="flex-shrink-0"
          >
            Submit Round
          </FwButton>
        </div>
      )}

      {/* B4: every `setError` call during tracking (a failed checkpoint, a
          failed autosave, a restore/discard failure) used to have no
          visible surface at all outside an active submit attempt — the
          SubmitOverlay's own `error` prop only renders while
          `step === 'submitting'`. This banner is the one place those
          errors become visible and dismissible, mirroring Continue Round's
          tracking-step error banner. A conflict block additionally gets a
          Reload control: "reload to continue" must name a dead end the
          player can act on right here. */}
      {error && step === 'tracking' && (
        <div className={fairwayScope('max-w-[720px] mx-auto px-4 py-4')}>
          <div role="alert" className="bg-fw-danger-bg border border-fw-danger/30 text-fw-danger-ink px-4 py-3 rounded-fw-md font-fw-sans text-body-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="flex-1">{error}</p>
              {!roundConflictBlocked && (
                <FwButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Dismiss error"
                  onClick={() => setError('')}
                  className="flex-shrink-0"
                >
                  Dismiss
                </FwButton>
              )}
            </div>
            {roundConflictBlocked && (
              <FwButton
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Reload
              </FwButton>
            )}
          </div>
        </div>
      )}

      {/* Shot-tracking screen — presentation only, no mutation/autosave logic moves. */}
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
          autoSaveDisabled={step === 'submitting' || !!completedRoundId}
        />
      </div>

      {/* Offline Warning Banner - shows when offline or has slow connection */}
      {step === 'tracking' && showOfflineWarning && (
        <OfflineWarningBanner
          variant="floating"
          showForSlowConnection={true}
          dismissable={true}
          onDismiss={() => setShowOfflineWarning(false)}
          context="tracking your round"
        />
      )}

      {/* Floating Sync Status removed — was popping up during normal online use */}

      {/* Draft Auto-Save Indicator removed - was too noisy */}

      {/* Note: there is no floating "Back to Setup" control here — the
          FairwayScorecardHeader already provides a single sticky
          Exit/Prev/Next control row in the same top region, so a second
          cream-styled Back here would overlap and compete with it
          (Nielsen #4 consistency / #8 minimalist). */}

      {/* Emergency Save Recovery Dialog — hoisted above the setup/holes
          early return so it renders there too (B4); see `recoveryDialog`. */}
      {recoveryDialog}

      {/* Save Round Modal */}
      <ExitRoundModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveForLater={handleSaveForLater}
        onDelete={handleDeleteRound}
        currentHole={currentHoleIndex + 1}
        totalHoles={holes.length}
      />

      {/* Back to Setup Confirmation Modal */}
      <ModalShell
        open={showBackToSetupModal}
        onOpenChange={(next) => {
          if (!next) setShowBackToSetupModal(false);
        }}
        size="sm"
        title="Go back to setup?"
        hideTitle
        hideClose
      >
        <div className="px-6 pb-6 pt-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-fw-md bg-fw-warning-bg">
              <IconWarning size={20} className="text-fw-warning-ink" />
            </div>
            <div>
              <h2 className="font-fw-display text-body font-medium tracking-[-0.005em] text-text-primary">
                Go back to setup?
              </h2>
              <p className="mt-0.5 font-fw-sans text-sm text-text-tertiary">
                Your progress and shot data will be lost.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <FwButton variant="secondary" className="flex-1" onClick={() => setShowBackToSetupModal(false)}>
              Keep Playing
            </FwButton>
            <FwButton variant="danger" className="flex-1" onClick={handleConfirmBackToSetup}>
              Reset &amp; Go Back
            </FwButton>
          </div>
        </div>
      </ModalShell>

      {/* Finish Round — Premium Round Summary */}
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

      {/* Submit Overlay — shows during submission, success celebration, and errors */}
      <SubmitOverlay
        isVisible={step === 'submitting'}
        totalScore={submittingTotalScore}
        toPar={submittingToPar}
        courseName={setupData.courseName}
        error={error || undefined}
        completedRoundId={completedRoundId ?? undefined}
        onGoBack={() => {
          setError('');
          setQualifierClosed(false);
          isSubmittingRef.current = false;
          setStep('tracking');
          // Always re-show the finish confirm so user can submit again
          if (pendingFinalStats) {
            setShowFinishConfirm(true);
          }
        }}
        onRetry={qualifierClosed ? undefined : (pendingFinalStats ? () => {
          setError('');
          isSubmittingRef.current = false;
          void handleRoundSubmit(pendingFinalStats);
        } : undefined)}
        secondaryActionLabel={qualifierClosed ? 'Save as practice round' : undefined}
        onSecondaryAction={qualifierClosed ? handleSaveAsPractice : undefined}
        onSaveAndExit={async () => {
          setError('');
          isSubmittingRef.current = false;
          await handleSaveForLater();
        }}
        onDiscard={async () => {
          setError('');
          isSubmittingRef.current = false;
          await handleDeleteRound();
        }}
      />

    </>
  );
}
