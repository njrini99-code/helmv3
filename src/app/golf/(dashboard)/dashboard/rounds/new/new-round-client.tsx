'use client';

import { startTransition, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ShotTrackingComprehensive from '@/components/golf/ShotTrackingComprehensive';
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
import { RecentCoursesQuickPick } from '@/components/golf/rounds/new/RecentCoursesQuickPick';
import { TeePickerDrawer } from '@/components/golf/courses/TeePickerDrawer';
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import { contributeCourseFromRound, type TeeRoundDefaults } from '@/app/golf/actions/course-library';
import { checkRoundStaleness } from '@/app/golf/actions/round-drafts';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useRoundStatusSync } from '@/hooks/golf/use-round-status-sync';
import { useOfflineSyncStore, useOfflineSyncStatus } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { saveOfflineRound } from '@/lib/offline/indexed-db';
import { OfflineWarningBanner } from '@/components/golf';
import { IconBookmark, IconCheck, IconChartBar, IconFlag, IconMapPin, IconPlus, IconSearch, IconTrophy, IconWarning } from '@/components/icons';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { GolfTabBar } from '@/components/golf/GolfTabBar';

import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';
import { RoundSubmitOverlay } from '@/components/golf/RoundSubmitOverlay';
import { FairwaySaveRoundModal } from '@/components/fairway/pages/rounds-new/FairwaySaveRoundModal';
import { FairwayRoundSubmitOverlay } from '@/components/fairway/pages/rounds-new/FairwayRoundSubmitOverlay';
import { useToast } from '@/components/ui/sonner';
import { triggerHaptic } from '@/lib/utils/capacitor';
// DraftIndicator removed - was too noisy
import type { HoleConfig } from '@/lib/types/golf-course';
import { useMobileNav } from '@/contexts/mobile-nav-context';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Button } from '@/components/ui/button';
import {
  emergencySave,
  loadEmergencySave,
  clearEmergencySave,
  isRecoverableRoundSubmitError,
  type EmergencySaveData
} from '@/lib/utils/emergency-save';
import { useRedesign, fairwayScope } from '@/lib/redesign/flag';
import { FairwayNewRoundEntry } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';

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


interface NewRoundClientProps {
  existingInProgressRound?: {
    id: string;
    courseName: string;
    currentHole: number;
    holesPlayed: number;
  } | null;
}

export default function NewRoundClient({ existingInProgressRound }: NewRoundClientProps) {
  const prefersReducedMotion = useReducedMotion();
  const redesign = useRedesign();
  // Flag-gated overlay swaps — Fairway versions share the legacy prop contracts
  // exactly, so flag-off renders the legacy components byte-for-byte.
  const ExitRoundModal = redesign ? FairwaySaveRoundModal : SaveRoundModal;
  const SubmitOverlay = redesign ? FairwayRoundSubmitOverlay : RoundSubmitOverlay;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  // Unfinished rounds are surfaced on the /rounds page (UnfinishedRoundsSection),
  // not as a gate here — starting a New Round lands straight on the course
  // carousel. (existingInProgressRound is still used for emergency-save/status
  // wiring below; we just never show the resume prompt.)
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const resumePromptUpdatedAtRef = useRef<string | undefined>(undefined);

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
  const pendingServerSaveRef = useRef<{ shots: ShotRecord[]; holeIndex: number; roundData?: PartialRoundData } | null>(null);
  const consecutiveSaveFailuresRef = useRef(0);
  const lastAutoSaveWarningRef = useRef(0); // Timestamp to throttle warning toasts
  const savedRoundIdRef = useRef<string | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);
  // Optimistic locking: tracks the last server-side updated_at for conflict detection
  const lastServerUpdatedAtRef = useRef<string | undefined>(undefined);
  const [pendingFinalStats, setPendingFinalStats] = useState<HoleStats[] | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showBackToSetupModal, setShowBackToSetupModal] = useState(false);
  const [completedRoundId, setCompletedRoundId] = useState<string | null>(null);

  // Ref to track the furthest hole the player has naturally progressed to.
  // Used to navigate back correctly after re-editing a completed hole (#21).
  const activeProgressHoleRef = useRef(0);

  // Ref for stale closure prevention in async auto-save (#20)
  const inProgressShotsByHoleRef = useRef(inProgressShotsByHole);
  inProgressShotsByHoleRef.current = inProgressShotsByHole;

  // Set roundDate on mount to avoid server/client timezone hydration mismatch
  useEffect(() => {
    if (!setupData.roundDate) {
      setSetupData(prev => ({ ...prev, roundDate: new Date().toISOString().split('T')[0]! }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emergency save recovery state
  const [showNewRoundRecovery, setShowNewRoundRecovery] = useState(false);
  const [newRoundRecoveryData, setNewRoundRecoveryData] = useState<EmergencySaveData | null>(null);

  // Throttle auto-save warning to at most once per 60s to avoid toast spam
  const showAutoSaveWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoSaveWarningRef.current < 60_000) return;
    lastAutoSaveWarningRef.current = now;
    showToast('Auto-save is having trouble. Your draft is saved locally, but server sync may be delayed.', 'warning');
  }, [showToast]);

  const redirectToCompletedRound = useCallback(() => {
    const targetRoundId = savedRoundIdRef.current;
    if (!targetRoundId) {
      return;
    }

    setError('');
    setShowResumePrompt(false);
    isSubmittingRef.current = false;
    startTransition(() => {
      router.replace(`/golf/dashboard/rounds/${targetRoundId}`);
    });
  }, [router]);

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
    const roundId = savedRoundIdRef.current;
    if (!roundId) {
      setError(fallbackMessage);
      showToast(fallbackMessage, 'error');
      return;
    }

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
  }, [redirectToCompletedRound, showToast]);

  // Check for emergency save on mount (for new rounds saved under _new key)
  useEffect(() => {
    const emergencyData = loadEmergencySave(null);
    if (!emergencyData) return;
    // Only show recovery if there's meaningful data (at least some holes completed or shots tracked)
    const hasData = emergencyData.completedHoleStats?.some(h => h != null) ||
      Object.keys(emergencyData.inProgressShotsByHole || {}).length > 0;
    if (hasData) {
      setShowNewRoundRecovery(true);
      setNewRoundRecoveryData(emergencyData);
    }
  }, []);

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
    roundId: step === 'setup' && showResumePrompt ? existingInProgressRound?.id ?? null : null,
    expectedUpdatedAtRef: resumePromptUpdatedAtRef,
    onRoundCompleted: () => {
      setShowResumePrompt(false);
    },
  });

  useRoundStatusSync({
    roundId: savedRoundId,
    expectedUpdatedAtRef: lastServerUpdatedAtRef,
    enabled: step === 'tracking' || step === 'submitting',
    onRoundCompleted: redirectToCompletedRound,
  });

  // Save data when user leaves the page (phone lock, app switch, tab close)
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    // Warn before closing tab/navigating away if there's any data to lose
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
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
      const { currentHole, holesSnapshot, statsSnapshot, mergedInProgress, setup } = buildEmergencyPayload();

      // 1. SYNCHRONOUS localStorage write — guaranteed to complete before page freeze
      // Fires on ALL steps so setup/holes data is preserved, not just tracking
      emergencySave({
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
        holes: statsSnapshot,
        inProgressShots: inProgressArr,
        holeConfigs: holesSnapshot.map(hole => ({
          holeNumber: hole.number,
          par: hole.par,
          yardage: hole.yardage,
        })),
      };
      void savePartialRound(saveData, savedRoundIdRef.current ?? undefined);
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
  }, []); // Empty deps — all values read from refs, no stale closures

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

  const buildRecoverySetupData = useCallback(() => ({
    ...setupData,
    qualifierId: setupData.roundType === 'qualifier' ? selectedQualifierId ?? undefined : undefined,
    qualifierRoundNumber: setupData.roundType === 'qualifier' ? selectedRoundNumber ?? undefined : undefined,
  }), [selectedQualifierId, selectedRoundNumber, setupData]);

  const persistFailedSubmission = useCallback(async (allHoleStats: HoleStats[]) => {
    const recoverySetupData = buildRecoverySetupData();
    const currentRoundId = savedRoundIdRef.current;

    emergencySave({
      roundId: currentRoundId,
      timestamp: Date.now(),
      setupData: recoverySetupData,
      holes,
      completedHoleStats: allHoleStats,
      inProgressShotsByHole: {},
      currentHoleIndex: Math.max(0, holes.length - 1),
      holesPerRound,
    });

    try {
      await saveOfflineRound({
        id: currentRoundId ?? `pending_submit_${Date.now()}`,
        playerId: '',
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
        },
      });
    } catch {
      // localStorage emergency save above remains the hard fallback
    }
  }, [buildRecoverySetupData, holes, holesPerRound]);

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

  // Fetch qualifiers when round type changes to 'qualifier'
  useEffect(() => {
    if (setupData.roundType === 'qualifier') {
      setLoadingQualifiers(true);
      setQualifierError(null);
      getPlayerQualifiers()
        .then(result => {
          setLoadingQualifiers(false);
          if (!result.success) {
            setQualifierError(result.error);
            return;
          }
          // Filter to only active/in-progress qualifiers with remaining rounds
          const activeQualifiers = result.data.filter(
            q => q.status !== 'completed' && q.roundsCompleted < q.numRounds
          );
          setQualifiers(activeQualifiers);
          if (activeQualifiers.length === 0) {
            setQualifierError('You have no active qualifiers to enter rounds for.');
          }
        })
        .catch((err: Error) => {
          if (err.message?.includes('not found on the server') || err.message?.includes('Server Action')) {
            window.location.reload();
            return;
          }
          setLoadingQualifiers(false);
          setQualifierError('Failed to load qualifiers. Please try refreshing.');
        });
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
    }
  }, [setupData.roundType]);

  // Fetch available round numbers when qualifier is selected
  useEffect(() => {
    if (selectedQualifierId) {
      getNextQualifierRoundNumber(selectedQualifierId)
        .then(result => {
          if (result.success && result.data) {
            setAvailableRounds(result.data.availableRounds);
            // Auto-select the next round number
            if (result.data.nextRoundNumber > 0) {
              setSelectedRoundNumber(result.data.nextRoundNumber);
            }
          }
        })
        .catch((err: Error) => {
          if (err.message?.includes('not found on the server') || err.message?.includes('Server Action')) {
            window.location.reload();
            return;
          }
        });
    } else {
      setAvailableRounds([]);
      setSelectedRoundNumber(null);
    }
  }, [selectedQualifierId]);

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

  // Redesign: the course picker IS the first screen of a new round. Auto-open
  // it once on a fresh start (not resuming, nothing chosen yet) so picking a
  // course is the landing action; "Browse course library" stays as the reopen
  // affordance. Closing it without picking falls back to the setup screen and
  // does not reopen (the ref latches).
  const autoOpenedPickerRef = useRef(false);
  useEffect(() => {
    if (!redesign || showResumePrompt || step !== 'setup') return;
    if (autoOpenedPickerRef.current) return;
    // Don't auto-open the cloud picker offline — listCourses needs the network and
    // would greet the user with an error toast + empty library. The offline-friendly
    // saved-course / manual path on the setup screen still works; "Browse course
    // library" stays available to retry once back online.
    if (!connectionStatus.isOnline) return;
    const nothingChosenYet =
      !selectedCourseId && selectedTeeIdRef.current == null && !setupData.courseName;
    autoOpenedPickerRef.current = true;
    if (nothingChosenYet) setTeePickerOpen(true);
  }, [redesign, showResumePrompt, step, selectedCourseId, setupData.courseName, connectionStatus.isOnline]);

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
      return;
    }

    const course = savedCourses.find(c => c.id === courseId);
    if (course) {
      // Store the golf_courses FK from the saved course
      resolvedCourseIdRef.current = course.courseId ?? null;
      selectedTeeIdRef.current = null; // saved course, not a cloud tee
      setCloudPickActive(false);
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
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, selectedQualifierId, selectedRoundNumber, inProgressShotsByHole, holesPerRound]);


  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-clicks / duplicate submissions
    if (isStartingRound) return;
    setIsStartingRound(true);
    
    if (!setupData.courseName) {
      setError('Please enter a course name');
      setIsStartingRound(false);
      return;
    }
    // Validate qualifier selection if round type is qualifier
    if (setupData.roundType === 'qualifier') {
      if (!selectedQualifierId) {
        setError('Please select a qualifier');
        setIsStartingRound(false);
        return;
      }
      if (!selectedRoundNumber) {
        setError('Please select which round of the qualifier this is');
        setIsStartingRound(false);
        return;
      }
    }

    // Validate courseRating and courseSlope ranges (must match server Zod schema in golf.ts)
    if (setupData.courseRating) {
      const rating = parseFloat(setupData.courseRating);
      if (isNaN(rating) || rating < 50 || rating > 85) {
        setError('Course rating must be between 50.0 and 85.0');
        setIsStartingRound(false);
        return;
      }
    }
    if (setupData.courseSlope) {
      const slope = parseInt(setupData.courseSlope);
      if (isNaN(slope) || slope < 55 || slope > 155) {
        setError('Course slope must be between 55 and 155');
        setIsStartingRound(false);
        return;
      }
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
      setHoles(initialHoles);
      setCompletedHoleStats([]);
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

  const handleHolesSave = async (configuredHoles: HoleConfig[]) => {
    // Convert HoleConfig to Hole format
    const initialHoles: Hole[] = configuredHoles.map((h) => ({
      number: h.holeNumber,
      par: h.par,
      yardage: h.yardage,
      score: null,
    }));
    setHoles(initialHoles);
    setCompletedHoleStats([]);

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
      currentHole: Math.min(holeIndexToUse + 1, holes.length),
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
  }, [completedHoleStats, currentHoleIndex, inProgressShotsByHole, holes, setupData, selectedQualifierId, selectedRoundNumber]);

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
      roundId: savedRoundIdRef.current,
      timestamp: Date.now(),
      setupData,
      holes: updatedHoles,
      completedHoleStats: updatedStats,
      inProgressShotsByHole: inProgressAfter,
      currentHoleIndex: isReEdit ? activeProgressHoleRef.current : holeIndex + 1,
      holesPerRound,
    });

    // Fire-and-forget: persist completed hole data to database (non-blocking)
    // Uses the same queue pattern as handleAutoSave to avoid silently dropping saves
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
        const result = await savePartialRound(
          saveData,
          savedRoundIdRef.current ?? undefined
        );
        if (result.success) {
          consecutiveSaveFailuresRef.current = 0;
          if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
          if (!savedRoundIdRef.current) {
            savedRoundIdRef.current = result.data.roundId;
            setSavedRoundId(result.data.roundId);
          }
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
            // Queued from handleHoleComplete — save the pre-built round data
            void (async () => {
              serverSaveInProgressRef.current = true;
              try {
                const r = await savePartialRound(pending.roundData!, savedRoundIdRef.current ?? undefined);
                if (r.success) {
                  consecutiveSaveFailuresRef.current = 0;
                  if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
                  if (!savedRoundIdRef.current) {
                    savedRoundIdRef.current = r.data.roundId;
                    setSavedRoundId(r.data.roundId);
                  }
                } else if (r.error === 'conflict') {
                  void handleRoundSyncConflict('This round was updated on another device. Please reload.');
                } else if (isCompletedRoundError(r.error)) {
                  redirectToCompletedRound();
                }
              } catch { /* non-critical */ } finally {
                serverSaveInProgressRef.current = false;
              }
            })();
          } else if (pending.holeIndex >= 0) {
            // Queued from handleAutoSave — execute with current state
            void (async () => {
              serverSaveInProgressRef.current = true;
              try {
                const autoSaveData = buildPartialRoundData();
                const r = await savePartialRound(autoSaveData, savedRoundIdRef.current ?? undefined);
                if (r.success) {
                  consecutiveSaveFailuresRef.current = 0;
                  if (r.data.updatedAt) lastServerUpdatedAtRef.current = r.data.updatedAt;
                  if (!savedRoundIdRef.current) {
                    savedRoundIdRef.current = r.data.roundId;
                    setSavedRoundId(r.data.roundId);
                  }
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
      // Re-editing a previously completed hole — return to the active frontier
      setCurrentHoleIndex(activeProgressHoleRef.current);
    } else if (holeIndex < holes.length - 1) {
      // Normal progression — advance to next hole
      const nextHole = holeIndex + 1;
      setCurrentHoleIndex(nextHole);
      activeProgressHoleRef.current = nextHole;
    } else {
      // Last hole completed for the first time — show finish confirmation
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
   * Auto-save handler for shot tracking - persists to localStorage + database
   * This is called by ShotTrackingComprehensive after each shot entry
   */
  const handleAutoSave = useCallback(async (shots: ShotRecord[], holeIndex: number) => {
    // Skip auto-save entirely if the round has been submitted or is being submitted
    if (isSubmittingRef.current || completedRoundId) return;

    // Also update parent's in-progress shots so navigation between holes stays in sync
    setInProgressShotsByHole(prev => {
      // Only update if shots actually changed (avoid unnecessary re-renders)
      const existing = prev[holeIndex];
      if (existing && existing.length === shots.length && existing === shots) return prev;
      return { ...prev, [holeIndex]: shots };
    });

    // SYNCHRONOUS localStorage backup — always runs, always completes
    emergencySave({
      roundId: savedRoundIdRef.current,
      timestamp: Date.now(),
      setupData: setupDataRef.current,
      holes: holesRef.current,
      completedHoleStats: completedHoleStatsRef.current,
      inProgressShotsByHole: { ...inProgressShotsByHoleRef.current, [holeIndex]: shots },
      currentHoleIndex: holeIndex,
      holesPerRound: holesPerRoundRef.current,
    });

    // Update pending counts in case there are any offline items
    await useOfflineSyncStore.getState().updatePendingCount();

    // Server save — awaited so the hook's circuit breaker can detect failures.
    // localStorage backup above already succeeded, so throwing here is safe and
    // lets the hook track consecutive failures to engage the circuit breaker.
    if (navigator.onLine) {
      if (serverSaveInProgressRef.current) {
        // Queue this save — it will execute after the current one completes.
        // Don't throw here: the queued save will be picked up after the in-flight one finishes.
        pendingServerSaveRef.current = { shots, holeIndex };
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
            if (result.data.updatedAt) lastServerUpdatedAtRef.current = result.data.updatedAt;
            if (!savedRoundIdRef.current) {
              savedRoundIdRef.current = result.data.roundId;
              setSavedRoundId(result.data.roundId);
            }
          } else if (result.error === 'conflict') {
            void handleRoundSyncConflict('This round was updated on another device. Please reload.');
          } else if (isCompletedRoundError(result.error)) {
            redirectToCompletedRound();
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
                } else if (r.error === 'conflict') {
                  void handleRoundSyncConflict('This round was updated on another device. Please reload.');
                } else if (isCompletedRoundError(r.error)) {
                  redirectToCompletedRound();
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
    buildPartialRoundData,
    completedRoundId,
    handleRoundSyncConflict,
    isCompletedRoundError,
    redirectToCompletedRound,
    showAutoSaveWarning,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setStep('submitting');
    setError('');

    // Clear any queued shot-level auto-save
    pendingServerSaveRef.current = null;

    try {
      const recoverySetupData = buildRecoverySetupData();

      // Save pre-submit snapshot to localStorage as insurance
      emergencySave({
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

      const result = await submitGolfRoundComprehensive(roundData, savedRoundIdRef.current ?? undefined);
      if (!result.success) {
        if (isCompletedRoundError(result.error)) {
          redirectToCompletedRound();
          return;
        }
        throw new Error(result.error);
      }

      // Clear local recovery state after successful submission
      clearEmergencySave(savedRoundIdRef.current);

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

  const handleSaveForLater = async () => {
    const result = await savePartialRound(buildPartialRoundData(), savedRoundId || undefined);

    if (!result.success) {
      if (result.error === 'conflict') {
        await handleRoundSyncConflict('This round was updated on another device. Please reload.');
        return;
      }
      if (isCompletedRoundError(result.error)) {
        redirectToCompletedRound();
        return;
      }
      throw new Error(result.error || 'Failed to save round. Please try again.');
    }

    savedRoundIdRef.current = result.data.roundId;
    setSavedRoundId(result.data.roundId);

    // Clear local recovery state only — the round itself was intentionally kept in the DB.
    clearEmergencySave(savedRoundIdRef.current);
    setShowExitModal(false);

    router.push('/golf/dashboard/rounds');
    router.refresh();
  };

  const handleDeleteRound = async () => {
    if (savedRoundId) {
      // Delete from database if it exists
      const result = await deleteInProgressRound(savedRoundId);
      if (!result.success) {
        setError(result.error || 'Failed to delete round');
        setShowExitModal(false);
        return;
      }
    }

    // Clear local recovery state after successful server delete (or no server round)
    clearEmergencySave(savedRoundId);
    setShowExitModal(false);

    // Redirect to rounds page
    router.push('/golf/dashboard/rounds');
  };

  const selectedCourse = selectedCourseId
    ? savedCourses.find(course => course.id === selectedCourseId) || null
    : null;

  // Relative time formatter for course cards
  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Compute total par from hole configs
  const computeTotalPar = (configs: SavedCourseHoleConfig[]): number => {
    return configs.reduce((sum, h) => sum + h.par, 0);
  };

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

  // ============================================================================
  // STEP PROGRESS INDICATOR
  // ============================================================================
  const stepConfig = [
    { key: 'setup', label: 'Course Setup', shortLabel: 'Setup' },
    { key: 'holes', label: 'Hole Config', shortLabel: 'Holes' },
    { key: 'tracking', label: 'Shot Tracking', shortLabel: 'Track' },
    { key: 'submitting', label: 'Submit', shortLabel: 'Done' },
  ];
  const currentStepIndex = stepConfig.findIndex(s => s.key === step);

  const StepProgressBar = () => (
    <div className="flex items-center gap-1 mb-6">
      {stepConfig.map((s, i) => {
        const isActive = i === currentStepIndex;
        const isComplete = i < currentStepIndex;
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-warm-200">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  isComplete ? 'bg-primary-500 w-full' : isActive ? 'bg-primary-400 w-1/2' : 'w-0'
                }`}
                style={{ width: isComplete ? '100%' : isActive ? '50%' : '0%' }}
              />
            </div>
            <span className={`text-xs font-medium ${isActive ? 'text-primary-600' : isComplete ? 'text-warm-600' : 'text-warm-400'}`}>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.shortLabel}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  // ============================================================================
  // FAIRWAY FORK (ADDITIVE) — flag ON renders the redesigned ENTRY screens
  // (resume gate + setup + holes) from the SAME state + handlers. The tracking
  // and submitting steps still fall through to the legacy render below (a later
  // phase). Flag OFF → every legacy branch below is byte-for-byte unchanged. No
  // mutation/autosave/optimistic-lock logic moves; this is presentation only.
  // ============================================================================
  if (redesign && (showResumePrompt || step === 'setup' || step === 'holes')) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayNewRoundEntry
          step={step}
          showResumePrompt={showResumePrompt}
          existingInProgressRound={existingInProgressRound}
          onContinueResume={() =>
            existingInProgressRound &&
            router.push(`/golf/dashboard/rounds/continue/${existingInProgressRound.id}`)
          }
          onStartFresh={() => setShowResumePrompt(false)}
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
          onClearSelectedCourse={() => {
            setSelectedCourseId(null);
            setPreloadedHoleConfigs(null);
            // Clear any cloud-link so a subsequently hand-typed course can't inherit
            // a stale tee_id/course_id from the previously selected course.
            resolvedCourseIdRef.current = null;
            selectedTeeIdRef.current = null;
            setCloudPickActive(false);
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
          selectedQualifierId={selectedQualifierId}
          setSelectedQualifierId={setSelectedQualifierId}
          availableRounds={availableRounds}
          selectedRoundNumber={selectedRoundNumber}
          setSelectedRoundNumber={setSelectedRoundNumber}
          error={error}
          isStartingRound={isStartingRound}
          onSubmit={handleSetupSubmit}
          onCancel={() => router.back()}
          onHolesSave={handleHolesSave}
          onHolesBack={() => setStep('setup')}
        />
        <FairwayCoursePicker open={teePickerOpen} onOpenChange={setTeePickerOpen} onPick={handleTeePick} />
      </div>
    );
  }

  // ============================================================================
  // RESUME IN-PROGRESS ROUND PROMPT
  // ============================================================================
  if (showResumePrompt && existingInProgressRound) {
    return (
      <>
        <MobileNavHeader title="New Round" backHref="/golf/dashboard" backLabel="Dashboard" />
        <div className="min-h-dvh bg-transparent flex items-center justify-center p-4">
          <div className="w-full max-w-md">
          <div className="relative surface-matte rounded-3xl overflow-clip p-6 sm:p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
              <IconFlag size={24} className="text-primary-500" />
            </div>
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">
              Round in Progress
            </h2>
            <p className="text-warm-500 text-sm mb-1">
              You have an unfinished round at
            </p>
            <p className="text-warm-800 font-medium mb-1">
              {existingInProgressRound.courseName}
            </p>
            <p className="text-warm-400 text-sm mb-6">
              Hole {existingInProgressRound.currentHole} of {existingInProgressRound.holesPlayed}
            </p>
            <div className="flex flex-col gap-3">
              <Button variant="primary"
                onClick={() => router.push(`/golf/dashboard/rounds/continue/${existingInProgressRound.id}`)}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors shadow-sm"
              >
                Continue Round
              </Button>
              <Button variant="ghost"
                onClick={() => setShowResumePrompt(false)}
                className="w-full py-3 rounded-xl bg-warm-100 text-warm-600 font-medium hover:bg-warm-200 transition-colors"
              >
                Start Fresh Round
              </Button>
            </div>
          </div>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // SETUP STEP
  // ============================================================================
  if (step === 'setup') {
    return (
      <>
        <MobileNavHeader title="New Round" backHref="/golf/dashboard" backLabel="Dashboard" />
        <div className="min-h-dvh bg-transparent flex items-start justify-center p-4 py-8">
          <div className="w-full max-w-2xl space-y-5">
          {/* PRIMARY course source: the shared Cloud Course Library (course + tee,
              pre-fills pars/yards and links the round to the catalog). */}
          {!showResumePrompt && (
            <Button
              variant="primary"
              onClick={() => setTeePickerOpen(true)}
              className="w-full justify-center"
            >
              <IconMapPin size={16} aria-hidden /> Browse course library
            </Button>
          )}
          {redesign
            ? <FairwayCoursePicker open={teePickerOpen} onOpenChange={setTeePickerOpen} onPick={handleTeePick} />
            : <TeePickerDrawer open={teePickerOpen} onOpenChange={setTeePickerOpen} onPick={handleTeePick} />}

          {/* Fallback: courses you've played before (per-player). Hidden when empty. */}
          {recentCourses.length > 0 && !showResumePrompt && (
            <RecentCoursesQuickPick
              courses={recentCourses}
              onConfirmCourse={handleQuickPickConfirm}
            />
          )}

          <Reveal>
            <div className="surface-stone rounded-3xl p-6 md:p-10">
              <PageHeader
                eyebrow="New Round · Setup"
                eyebrowAccent="primary"
                title="Track every shot of this round."
                subtitle="Pick a course, set up your scorecard, then start tracking."
              />
            </div>
          </Reveal>

          <div className="relative surface-matte rounded-3xl overflow-clip p-5 sm:p-8">
            <StepProgressBar />

            <form onSubmit={handleSetupSubmit} className="space-y-6">
              {/* Offline Warning Banner - inline variant for setup step */}
              {!connectionStatus.isOnline && (
                <OfflineWarningBanner
                  variant="inline"
                  showForSlowConnection={true}
                  dismissable={true}
                  context="Starting a round"
                />
              )}

              {/* ── Course Selection ── */}
              {!loadingSavedCourses && savedCourses.length > 0 && (
                <div className="rounded-2xl border border-warm-200/45 bg-cream-100/68 backdrop-blur-sm p-5 shadow-sm">
                  {/* Header with mode toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary-500/10 text-primary-600 flex items-center justify-center">
                        {courseMode === 'saved' ? <IconBookmark size={18} /> : <IconPlus size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-warm-900">Course</p>
                        <p className="text-xs text-warm-500">
                          {courseMode === 'saved'
                            ? `${savedCourses.length} saved course${savedCourses.length !== 1 ? 's' : ''}`
                            : 'Enter new course details'}
                        </p>
                      </div>
                    </div>
                    <GolfTabBar<'saved' | 'new'>
                      ariaLabel="Course source"
                      compact
                      tabs={[
                        { id: 'saved', label: 'Saved', icon: <IconBookmark size={13} /> },
                        { id: 'new', label: 'New', icon: <IconPlus size={13} /> },
                      ]}
                      value={courseMode}
                      onChange={(next) => {
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
                          setPreloadedHoleConfigs(null);
                          setCourseSearchQuery('');
                          setSetupData(prev => ({
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
                    />
                  </div>

                  {/* ── Saved Course: Card Selector ── */}
                  {courseMode === 'saved' && (
                    <div className="mt-4 space-y-3">
                      {/* Search bar — only if 4+ courses */}
                      {savedCourses.length >= 4 && (
                        <div className="relative">
                          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                          <input
                            type="search"
                            value={courseSearchQuery}
                            onChange={(e) => setCourseSearchQuery(e.target.value)}
                            placeholder="Search saved courses..."
                            enterKeyHint="search"
                            autoComplete="off"
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-warm-200/70 bg-cream-100/82 text-base md:text-sm text-warm-700 placeholder:text-warm-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-colors"
                          />
                        </div>
                      )}

                      {/* Course cards */}
                      <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-hide pr-0.5">
                        {filteredSavedCourses.length === 0 ? (
                          <div className="text-center py-6 text-sm text-warm-400">
                            No courses match &ldquo;{courseSearchQuery}&rdquo;
                          </div>
                        ) : (
                          filteredSavedCourses.map((course) => {
                            const isSelected = selectedCourseId === course.id;
                            const totalPar = course.holeConfigs.length > 0 ? computeTotalPar(course.holeConfigs) : null;
                            const location = [course.courseCity, course.courseState].filter(Boolean).join(', ');

                            return (
                              <Button variant="primary"
                                key={course.id}
                                type="button"
                                onClick={() => handleSavedCourseSelect(isSelected ? null : course.id)}
                                className={`w-full text-left rounded-xl border p-3.5 transition-[color,background-color,border-color,box-shadow] duration-150 ${
                                  isSelected
                                    ? 'border-primary-400/60 bg-primary-50/60 ring-2 ring-primary-500/20 shadow-sm'
                                    : 'border-warm-200/70 bg-cream-100/75 hover:border-warm-300 hover:bg-cream-50/92 hover:shadow-sm'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    {/* Course name */}
                                    <div className="flex items-center gap-2">
                                      {isSelected && (
                                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary-500 flex items-center justify-center">
                                          <IconCheck size={12} className="text-white" />
                                        </span>
                                      )}
                                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-900' : 'text-warm-900'}`}>
                                        {course.courseName}
                                      </p>
                                    </div>

                                    {/* Location + tees */}
                                    <div className="flex items-center gap-1.5 mt-1">
                                      {location && (
                                        <span className="text-xs text-warm-500 flex items-center gap-1">
                                          <IconMapPin size={11} className="text-warm-400 flex-shrink-0" />
                                          {location}
                                        </span>
                                      )}
                                      {location && course.teesPlayed && (
                                        <span className="text-warm-300">·</span>
                                      )}
                                      {course.teesPlayed && (
                                        <span className="text-xs text-warm-500">{course.teesPlayed} tees</span>
                                      )}
                                    </div>

                                    {/* Stats row */}
                                    <div className="flex items-center gap-2 mt-2">
                                      {totalPar !== null && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-primary-100/80 text-primary-700' : 'bg-warm-100 text-warm-600'
                                        }`}>
                                          Par {totalPar}
                                        </span>
                                      )}
                                      {course.holeConfigs.length > 0 && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-primary-100/80 text-primary-700' : 'bg-warm-100 text-warm-600'
                                        }`}>
                                          {course.holeConfigs.length} holes
                                        </span>
                                      )}
                                      {course.courseRating !== null && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-primary-100/80 text-primary-700' : 'bg-warm-100 text-warm-600'
                                        }`}>
                                          {course.courseRating}/{course.courseSlope ?? '—'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Last played */}
                                  <span className="text-xs text-warm-400 whitespace-nowrap flex-shrink-0 pt-0.5">
                                    {formatRelativeTime(course.lastUsedAt)}
                                  </span>
                                </div>
                              </Button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Course Details: Compact summary when saved, full form when new ── */}
              {courseMode === 'saved' && selectedCourse ? (
                /* Compact summary card for selected saved course */
                <div className="rounded-2xl border border-primary-200/50 bg-primary-50/55 backdrop-blur-sm p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-medium text-warm-900 flex items-center gap-2">
                      <IconCheck size={16} className="text-primary-600" />
                      Course ready
                    </h2>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        setSelectedCourseId(null);
                        setPreloadedHoleConfigs(null);
                        setSetupData(prev => ({
                          ...prev,
                          courseName: '',
                          courseCity: '',
                          courseState: '',
                          courseRating: '',
                          courseSlope: '',
                          teesPlayed: 'White',
                        }));
                      }}
                      className="text-xs text-warm-500 hover:text-warm-700 transition-colors"
                    >
                      Change
                    </Button>
                  </div>
                  <p className="text-body font-medium text-warm-900 tracking-[-0.005em]">{selectedCourse.courseName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-warm-500">
                    {selectedCourse.courseCity && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={11} className="text-warm-400" />
                        {selectedCourse.courseCity}{selectedCourse.courseState ? `, ${selectedCourse.courseState}` : ''}
                      </span>
                    )}
                    {selectedCourse.teesPlayed && <span>{selectedCourse.teesPlayed} tees</span>}
                    {selectedCourse.courseRating !== null && <span>Rating {selectedCourse.courseRating}</span>}
                    {selectedCourse.courseSlope !== null && <span>Slope {selectedCourse.courseSlope}</span>}
                    {selectedCourse.holeConfigs.length > 0 && (
                      <span className="text-primary-600 font-medium">
                        {selectedCourse.holeConfigs.length} holes · Par {computeTotalPar(selectedCourse.holeConfigs)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Full form for new course entry */
                <div>
                  <h2 className="text-lg font-medium text-warm-900 mb-4">Course Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="courseName" className="text-sm font-medium text-warm-700 block mb-2">
                        Course Name *
                      </label>
                      <input
                        id="courseName"
                        type="text"
                        value={setupData.courseName}
                        onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                        placeholder="Pebble Beach Golf Links"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="courseCity" className="text-sm font-medium text-warm-700 block mb-2">
                          City
                        </label>
                        <input
                          id="courseCity"
                          type="text"
                          value={setupData.courseCity}
                          onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                          enterKeyHint="next"
                          autoComplete="off"
                          className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                          placeholder="Pebble Beach"
                        />
                      </div>
                      <div>
                        <label htmlFor="courseState" className="text-sm font-medium text-warm-700 block mb-2">
                          State
                        </label>
                        <input
                          id="courseState"
                          type="text"
                          value={setupData.courseState}
                          onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                          enterKeyHint="next"
                          autoComplete="off"
                          className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                          placeholder="CA"
                          maxLength={2}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="courseRating" className="text-sm font-medium text-warm-700 block mb-2">
                          Rating
                        </label>
                        <input
                          id="courseRating"
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={setupData.courseRating}
                          onChange={(e) => setSetupData({ ...setupData, courseRating: e.target.value })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                          placeholder="72.1"
                        />
                      </div>
                      <div>
                        <label htmlFor="courseSlope" className="text-sm font-medium text-warm-700 block mb-2">
                          Slope
                        </label>
                        <input
                          id="courseSlope"
                          type="number"
                          inputMode="numeric"
                          enterKeyHint="next"
                          value={setupData.courseSlope}
                          onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                          placeholder="133"
                          aria-label="Course slope rating"
                        />
                      </div>
                      <div>
                        <label htmlFor="teesPlayed" className="text-sm font-medium text-warm-700 block mb-2">
                          Tees
                        </label>
                        <select
                          id="teesPlayed"
                          value={setupData.teesPlayed}
                          onChange={(e) => setSetupData({ ...setupData, teesPlayed: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-lg border border-warm-200 bg-cream-100/82 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none transition-colors"
                        >
                          <option>Championship</option>
                          <option>Black</option>
                          <option>Blue</option>
                          <option>White</option>
                          <option>Gold</option>
                          <option>Red</option>
                        </select>
                      </div>
                    </div>

                    {/* Save Course — premium toggle callout for new courses */}
                    {courseMode === 'new' && (
                      <Button variant="primary"
                        type="button"
                        onClick={() => setSaveCourseChecked(!saveCourseChecked)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-colors duration-150 ${
                          saveCourseChecked
                            ? 'border-primary-300/60 bg-primary-50/50'
                            : 'border-warm-200/70 bg-cream-100/60 hover:bg-cream-100/75'
                        }`}
                      >
                        <div className={`flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          saveCourseChecked
                            ? 'border-primary-500 bg-primary-500'
                            : 'border-warm-300'
                        }`}>
                          {saveCourseChecked && <IconCheck size={12} className="text-white" />}
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-medium ${saveCourseChecked ? 'text-primary-900' : 'text-warm-700'}`}>
                            Save for quick access next round
                          </p>
                          <p className="text-xs text-warm-500 mt-0.5">
                            Remembers hole pars, yardages & course details
                          </p>
                        </div>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Active Qualifiers — quick-select cards */}
              {!loadingActiveQualifiers && allActiveQualifiers.length > 0 && setupData.roundType !== 'qualifier' && (
                <div className="rounded-2xl border border-purple-200/60 bg-purple-50/40 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <IconTrophy size={18} className="text-purple-600" />
                    <h3 className="text-sm font-medium text-purple-900">Active Qualifiers</h3>
                  </div>
                  <p className="text-xs text-purple-700/70 mb-3">Tap to start a qualifier round</p>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {allActiveQualifiers.map(q => (
                      <Button variant="ghost"
                        key={q.id}
                        type="button"
                        onClick={() => {
                          setSetupData(prev => ({ ...prev, roundType: 'qualifier' }));
                          setSelectedQualifierId(q.id);
                        }}
                        className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-purple-200/60 bg-cream-100/82 hover:bg-white hover:shadow-sm active:scale-[0.98] transition-all duration-150 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-warm-900 truncate">{q.name}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-warm-500">
                            {q.courseName && (
                              <span className="flex items-center gap-1 truncate">
                                <IconMapPin size={11} />
                                {q.courseName}
                              </span>
                            )}
                            <span>{q.roundsCompleted}/{q.numRounds} rounds</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                            Play
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Round Info */}
              <div>
                <h2 className="text-lg font-medium text-warm-900 mb-4">Round Details</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="roundType" className="text-sm font-medium text-warm-700 block mb-2">
                        Round Type
                      </label>
                      <select
                        id="roundType"
                        value={setupData.roundType}
                        onChange={(e) => setSetupData({ ...setupData, roundType: e.target.value as 'practice' | 'tournament' | 'qualifier' })}
                        className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none"
                      >
                        <option value="practice">Practice</option>
                        <option value="tournament">Tournament</option>
                        <option value="qualifier">Qualifier</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="roundDate" className="text-sm font-medium text-warm-700 block mb-2">
                        Date
                      </label>
                      <input
                        id="roundDate"
                        type="date"
                        value={setupData.roundDate}
                        onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-warm-200 focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Holes per round toggle */}
                  <div>
                    <label className="text-sm font-medium text-warm-700 block mb-2">
                      Holes
                    </label>
                    <GolfTabBar<'9' | '18'>
                      ariaLabel="Holes per round"
                      compact
                      tabs={[
                        { id: '9', label: '9 Holes' },
                        { id: '18', label: '18 Holes' },
                      ]}
                      value={holesPerRound === 9 ? '9' : '18'}
                      onChange={(next) => setHolesPerRound(next === '9' ? 9 : 18)}
                    />

                    {/* Front/Back Nine selector — shown when 9 holes on an 18-hole saved course */}
                    {holesPerRound === 9 && preloadedHoleConfigs && preloadedHoleConfigs.length >= 18 && (
                      <div className="mt-2">
                        <GolfTabBar<'front' | 'back'>
                          ariaLabel="Nine selection"
                          compact
                          tabs={[
                            { id: 'front', label: 'Front 9' },
                            { id: 'back', label: 'Back 9' },
                          ]}
                          value={nineSelection}
                          onChange={(next) => setNineSelection(next)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Qualifier Selection (shown when round type is qualifier) */}
              {setupData.roundType === 'qualifier' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
                    <IconTrophy size={18} className="text-amber-600" />
                    Qualifier Round
                  </h3>

                  {loadingQualifiers ? (
                    <div className="flex items-center gap-2 text-sm text-amber-700">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                      </span>
                      Loading your qualifiers...
                    </div>
                  ) : qualifierError ? (
                    <p className="text-sm text-amber-700">{qualifierError}</p>
                  ) : qualifiers.length === 0 ? (
                    <p className="text-sm text-amber-700">
                      You are not entered in any active qualifiers. Please contact your coach.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Qualifier Selection */}
                      <div>
                        <label htmlFor="qualifier" className="text-sm font-medium text-amber-800 block mb-2">
                          Select Qualifier *
                        </label>
                        <select
                          id="qualifier"
                          value={selectedQualifierId || ''}
                          onChange={(e) => setSelectedQualifierId(e.target.value || null)}
                          className="w-full px-4 py-2.5 rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                          required
                        >
                          <option value="">Choose a qualifier...</option>
                          {qualifiers.map(q => (
                            <option key={q.id} value={q.id}>
                              {q.name} ({q.roundsCompleted}/{q.numRounds} rounds completed)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Round Number Selection */}
                      {selectedQualifierId && availableRounds.length > 0 && (
                        <div>
                          <label htmlFor="roundNumber" className="text-sm font-medium text-amber-800 block mb-2">
                            Round Number *
                          </label>
                          <select
                            id="roundNumber"
                            value={selectedRoundNumber || ''}
                            onChange={(e) => setSelectedRoundNumber(Number(e.target.value) || null)}
                            className="w-full px-4 py-2.5 rounded-lg border border-amber-300 bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                            required
                          >
                            <option value="">Select round...</option>
                            {availableRounds.map(num => (
                              <option key={num} value={num}>
                                Round {num}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-amber-600 mt-1">
                            This is round {selectedRoundNumber} of {qualifiers.find(q => q.id === selectedQualifierId)?.numRounds || '?'}
                          </p>
                        </div>
                      )}

                      {/* Show selected qualifier info */}
                      {selectedQualifierId && (
                        <div className="bg-cream-100/60 rounded-lg p-3 mt-2">
                          {(() => {
                            const selected = qualifiers.find(q => q.id === selectedQualifierId);
                            if (!selected) return null;
                            return (
                              <>
                                <p className="text-sm text-amber-800">
                                  <span className="font-medium">{selected.name}</span>
                                </p>
                                {selected.courseName && (
                                  <p className="text-xs text-amber-700 mt-1">Course: {selected.courseName}</p>
                                )}
                                <p className="text-xs text-amber-700 mt-1">
                                  Progress: {selected.roundsCompleted} of {selected.numRounds} rounds completed
                                  {selected.completedRoundNumbers.length > 0 && (
                                    <> (Rounds: {selected.completedRoundNumbers.join(', ')})</>
                                  )}
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stats Info Box */}
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                <h3 className="font-medium text-primary-800 mb-2 flex items-center gap-2">
                  <IconChartBar size={18} className="text-primary-600" />
                  Comprehensive Stats Tracking
                </h3>
                <p className="text-sm text-primary-700">
                  This round will track 50+ statistics including driving distance, approach proximity,
                  putting efficiency, scrambling, and more. Use your rangefinder for accurate distances.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <Button variant="ghost"
                  type="button"
                  onClick={() => router.back()}
                  disabled={isStartingRound}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-warm-200 font-medium text-warm-700 hover:bg-warm-50 active:bg-warm-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </Button>
                <Button variant="primary"
                  type="submit"
                  disabled={isStartingRound}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-primary-600 font-medium text-white hover:bg-primary-700 transition-colors shadow-sm shadow-primary-950/10 ring-1 ring-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isStartingRound ? (
                    <>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                      </span>
                      Starting...
                    </>
                  ) : preloadedHoleConfigs && preloadedHoleConfigs.length > 0
                    ? 'Start Round →'
                    : 'Next: Configure Holes →'}
                </Button>
              </div>
            </form>
          </div>
          </div>
        </div>
      </>
    );
  }

  // ============================================================================
  // HOLES CONFIGURATION STEP
  // ============================================================================
  if (step === 'holes') {
    return (
      <>
        <MobileNavHeader title="Configure Holes" backHref="/golf/dashboard" backLabel="Dashboard" />
        <div className="min-h-full bg-transparent flex items-start justify-center p-4 pt-6">
          <div className="w-full max-w-2xl">
            <div className="relative surface-matte rounded-3xl overflow-clip p-5 sm:p-8">
              <StepProgressBar />
              <HoleConfigurationForm
                courseName={setupData.courseName}
                onSave={handleHolesSave}
                onBack={() => setStep('setup')}
                holesPerRound={holesPerRound}
              />
            </div>
          </div>
        </div>
      </>
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

  return (
    <>
      {/* Submit banner — shown when all holes are done but finish confirm was dismissed */}
      {pendingFinalStats && !showFinishConfirm && step === 'tracking' && (
        <div className="sticky top-[var(--golf-mobile-header-offset)] z-20 bg-primary-600 px-4 py-3 text-white lg:top-[49px] flex items-center justify-between gap-3">
          <p className="text-sm font-medium">All holes completed — ready to submit!</p>
          <Button variant="primary"
            onClick={() => setShowFinishConfirm(true)}
            className="px-4 py-2 rounded-lg bg-white text-primary-700 text-sm font-medium hover:bg-primary-50 active:bg-primary-100 transition-colors flex-shrink-0"
          >
            Submit Round
          </Button>
        </div>
      )}

      {/* FAIRWAY FORK (ADDITIVE) — flag ON renders the redesigned shot-tracking
          screen from the SAME props; flag OFF keeps the legacy component
          byte-for-byte. Presentation only — no mutation/autosave logic moves. */}
      {redesign ? (
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
      ) : (
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
        autoSaveDisabled={step === 'submitting' || !!completedRoundId}
      />
      )}

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

      {/* Back to Setup - always available during tracking */}
      <div className="fixed left-4 z-40 top-[max(1rem,env(safe-area-inset-top,0px))]">
        <Button variant="ghost"
          onClick={() => {
            const hasCompletedHoles = completedHoleStats.some(s => s?.score != null);
            if (hasCompletedHoles) {
              setShowBackToSetupModal(true);
            } else {
              setStep(preloadedHoleConfigs ? 'setup' : 'holes');
              setCurrentHoleIndex(0);
              activeProgressHoleRef.current = 0;
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cream-50/92 backdrop-blur-sm border border-warm-200 text-sm font-medium text-warm-600 hover:bg-white transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
      </div>

      {/* Emergency Save Recovery Dialog (new round) */}
      <Drawer
        open={Boolean(showNewRoundRecovery && newRoundRecoveryData)}
        onOpenChange={(next) => {
          if (!next) setShowNewRoundRecovery(false);
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
            <p className="text-sm text-warm-500 text-center mb-6">
              Found locally saved data with{' '}
              {newRoundRecoveryData?.completedHoleStats?.filter(h => h != null).length || 0} completed holes.
              This data may have been saved when the app was interrupted.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost"
                onClick={() => {
                  clearEmergencySave(null);
                  setShowNewRoundRecovery(false);
                  setNewRoundRecoveryData(null);
                }}
                className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 transition-colors"
              >
                Discard
              </Button>
              <Button variant="primary"
                onClick={() => {
                  const rd = newRoundRecoveryData;
                  if (!rd) return;
                  if (rd.completedHoleStats) setCompletedHoleStats(rd.completedHoleStats);
                  if (rd.inProgressShotsByHole) setInProgressShotsByHole(rd.inProgressShotsByHole);
                  if (rd.holes?.length > 0) setHoles(rd.holes);
                  if (rd.currentHoleIndex != null) {
                    setCurrentHoleIndex(rd.currentHoleIndex);
                    activeProgressHoleRef.current = rd.currentHoleIndex;
                  }
                  if (rd.setupData) setSetupData(rd.setupData);
                  if (rd.holesPerRound) setHolesPerRound(rd.holesPerRound);
                  setStep('tracking');
                  setShowNewRoundRecovery(false);
                  setNewRoundRecoveryData(null);
                }}
                className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
              >
                Restore
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

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
      <Drawer
        open={showBackToSetupModal}
        onOpenChange={(next) => {
          if (!next) setShowBackToSetupModal(false);
        }}
      >
        <DrawerContent
          className="sm:max-w-sm sm:mx-auto sm:rounded-3xl"
          aria-labelledby="back-setup-title"
        >
          <div className="px-6 pb-6 pt-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <IconWarning size={20} className="text-amber-600" />
              </div>
              <div>
                <DrawerTitle id="back-setup-title" className="text-body font-medium text-warm-900 tracking-[-0.005em]">
                  Go back to setup?
                </DrawerTitle>
                <p className="text-sm text-warm-500 mt-0.5">Your progress and shot data will be lost.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost"
                onClick={() => setShowBackToSetupModal(false)}
                className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 active:bg-warm-300 transition-colors min-h-[44px]"
              >
                Keep Playing
              </Button>
              <Button variant="danger"
                onClick={() => {
                  setShowBackToSetupModal(false);
                  setCompletedHoleStats([]);
                  setInProgressShotsByHole({});
                  setCurrentHoleIndex(0);
                  activeProgressHoleRef.current = 0;
                  setSavedRoundId(null);
                  savedRoundIdRef.current = null;
                  setStep(preloadedHoleConfigs ? 'setup' : 'holes');
                }}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 active:bg-red-700 transition-colors min-h-[44px]"
              >
                Reset & Go Back
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

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
              <Drawer
                key="round-summary-overlay"
                open={true}
                onOpenChange={(next) => {
                  if (!next) setShowFinishConfirm(false);
                }}
              >
                <DrawerContent className="sm:max-w-md sm:mx-auto sm:rounded-3xl p-0 overflow-y-auto">
                  <DrawerTitle className="sr-only">Round Complete</DrawerTitle>
                  <m.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
                  >
                  {/* Celebration Header */}
                  <div className="relative overflow-hidden rounded-t-2xl bg-primary-600 px-6 pt-6 pb-5 text-center">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
                    <m.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.15, duration: 0.4, type: 'spring', stiffness: 200, damping: 15 })}
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
                          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.25, duration: 0.3 })}
                          className="text-[44px] md:text-[52px] font-light tracking-[-0.025em] text-white tabular-nums"
                        >
                          {totalScore}
                        </m.span>
                        <m.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.35 })}
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
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.2, duration: 0.3 })}
                      className="grid grid-cols-3 gap-3 mb-5"
                    >
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-h3 font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{totalPutts}</p>
                        <p className="text-xs text-warm-500 font-medium">Putts</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-h3 font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{fairwaysHit}/{fairwayEligible}</p>
                        <p className="text-xs text-warm-500 font-medium">Fairways</p>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                        <p className="text-h3 font-medium text-warm-900 tracking-[-0.012em] tabular-nums">{girCount}/{fs.length}</p>
                        <p className="text-xs text-warm-500 font-medium">GIR</p>
                      </div>
                    </m.div>

                    {/* Mini Scorecard */}
                    <m.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.3, duration: 0.3 })}
                      className="mb-6"
                    >
                      <p className="text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80 mb-2">Scorecard</p>
                      <div className="rounded-xl border border-warm-200/35 overflow-x-auto overflow-hidden">
                        {/* Front 9 (or all 9 for 9-hole round) */}
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((_, i) => (
                            <div key={`h${i}`} className="bg-warm-50 text-center py-1">
                              <span className="text-eyebrow font-medium text-warm-400">{i + 1}</span>
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((h, i) => (
                            <div key={`p${i}`} className="bg-white text-center py-1">
                              <span className="text-eyebrow text-warm-400">{h?.par}</span>
                            </div>
                          ))}
                        </div>
                        <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                          {fs.slice(0, 9).map((h, i) => (
                            <ScoreCell key={`s${i}`} h={h} />
                          ))}
                        </div>

                        {/* Back 9 */}
                        {fs.length > 9 && (
                          <>
                            <div className="h-px bg-warm-300/40" />
                            <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                              {fs.slice(9, 18).map((_, i) => (
                                <div key={`h2${i}`} className="bg-warm-50 text-center py-1">
                                  <span className="text-eyebrow font-medium text-warm-400">{i + 10}</span>
                                </div>
                              ))}
                            </div>
                            <div className="grid gap-px bg-warm-200/60" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
                              {fs.slice(9, 18).map((h, i) => (
                                <div key={`p2${i}`} className="bg-white text-center py-1">
                                  <span className="text-eyebrow text-warm-400">{h?.par}</span>
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
                      transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4, duration: 0.3 })}
                      className="flex gap-3"
                    >
                      <Button variant="ghost"
                        onClick={() => setShowFinishConfirm(false)}
                        className="flex-1 py-3 rounded-xl bg-warm-100 text-warm-700 font-medium hover:bg-warm-200 active:bg-warm-300 transition-colors"
                      >
                        Go Back
                      </Button>
                      <Button variant="primary"
                        onClick={async () => {
                          if (!pendingFinalStats) return;
                          setShowFinishConfirm(false);
                          await handleRoundSubmit(pendingFinalStats);
                        }}
                        className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-sm shadow-primary-950/10"
                      >
                        Submit Round
                      </Button>
                    </m.div>
                  </div>
                  </m.div>
                </DrawerContent>
              </Drawer>
            );
          })()}
        </AnimatePresence>
      </LazyMotion>

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
          isSubmittingRef.current = false;
          setStep('tracking');
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
