'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShineEffect } from '@/components/ui/shine-effect';
import { useRouter } from 'next/navigation';
import ShotTrackingComprehensive, { type HoleStats, type ShotRecord } from '@/components/golf/ShotTrackingComprehensive';
import {
  submitGolfRoundComprehensive,
  savePartialRound,
  deleteInProgressRound,
  getPlayerQualifiers,
  getNextQualifierRoundNumber,
  getPlayerSavedCourses,
  savePlayerCourse,
  touchSavedCourse,
  type PlayerQualifierInfo,
  type SavedCourse,
  type SavedCourseHoleConfig
} from '@/app/golf/actions/golf';
import { checkForDraft, clearRoundDraft } from '@/app/golf/actions/round-drafts';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useOfflineSyncStore, useOfflineSyncStatus } from '@/stores/offline-sync-store';
import { getSyncEngine } from '@/lib/offline/sync-engine';
import { OfflineWarningBanner } from '@/components/golf';
import { IconBookmark, IconCheck, IconChartBar, IconMapPin, IconPlus, IconTrophy } from '@/components/icons';
import { HoleConfigurationForm } from '@/components/golf/HoleConfigurationForm';

import { SaveRoundModal } from '@/components/golf/SaveRoundModal';
import { ResumeDraftModal } from '@/components/golf/ResumeDraftModal';
// DraftIndicator removed - was too noisy
import type { HoleConfig } from '@/lib/types/golf-course';
import { useAutoSaveRound, type RoundDraftData } from '@/hooks/golf/use-auto-save-round';
import { useMobileNav } from '@/contexts/mobile-nav-context';

interface Hole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

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


export default function NewRoundClient() {
  const router = useRouter();

  // Hide mobile bottom nav for entire round flow (setup → holes → tracking → submit)
  const { hide: hideMobileNav, show: showMobileNav } = useMobileNav();
  useEffect(() => {
    hideMobileNav();
    return () => showMobileNav();
  }, [hideMobileNav, showMobileNav]);

  // Auto-save hook with database persistence
  const {
    scheduleSave,
     
    saveNow: _saveNow, // Available for manual save if needed
    loadDraft,
    clearDraft,
     
    saveStatus: _saveStatus, // Draft indicator removed
     
    isOnline: _isOnline, // Using connectionStatus.isOnline instead
     
    roundId: _draftRoundId, // Reserved for future offline storage integration
     
    getTimeSinceLastSave: _getTimeSinceLastSave, // Draft indicator removed
  } = useAutoSaveRound(null);

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
          onSyncComplete: (result) => {
            if (result.syncedRounds > 0 || result.syncedHoles > 0 || result.syncedShots > 0) {
              console.log(`[NewRound] Synced ${result.syncedRounds + result.syncedHoles + result.syncedShots} items`);
            }
          },
          onSyncError: (error) => {
            console.error('[NewRound] Sync error:', error.message);
          },
        });

        // Start the sync engine
        syncEngine.start();
        // Access store directly to avoid dependency issues
        await useOfflineSyncStore.getState().updatePendingCount();
      } catch (error) {
        console.error('[NewRound] Failed to initialize sync engine:', error);
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
        } catch (error) {
          console.error('[NewRound] Auto-sync failed:', error);
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
    roundDate: new Date().toISOString().split('T')[0]!,
  });
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [completedHoleStats, setCompletedHoleStats] = useState<HoleStats[]>([]);
  const [error, setError] = useState('');
  const [showExitModal, setShowExitModal] = useState(false);
  const [savedRoundId, setSavedRoundId] = useState<string | null>(null);
  const [inProgressShotsByHole, setInProgressShotsByHole] = useState<Record<number, ShotRecord[]>>({});

  // Resume draft modal state
  const [showResumeDraftModal, setShowResumeDraftModal] = useState(false);
  const [existingDraftInfo, setExistingDraftInfo] = useState<{
    roundId: string;
    courseName: string | null;
    holesCompleted: number;
    totalHoles: number;
    lastAutoSave: string | null;
    roundDate: string;
  } | null>(null);
  const [isCheckingForDraft, setIsCheckingForDraft] = useState(true);

  // Qualifier state
  const [qualifiers, setQualifiers] = useState<PlayerQualifierInfo[]>([]);
  const [loadingQualifiers, setLoadingQualifiers] = useState(false);
  const [selectedQualifierId, setSelectedQualifierId] = useState<string | null>(null);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const [availableRounds, setAvailableRounds] = useState<number[]>([]);
  const [qualifierError, setQualifierError] = useState<string | null>(null);

  // Saved courses state
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);
  const [loadingSavedCourses, setLoadingSavedCourses] = useState(true);
  const [courseMode, setCourseMode] = useState<'new' | 'saved'>('new');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [preloadedHoleConfigs, setPreloadedHoleConfigs] = useState<SavedCourseHoleConfig[] | null>(null);
  const [saveCourseChecked, setSaveCourseChecked] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');

  // Fetch qualifiers when round type changes to 'qualifier'
  useEffect(() => {
    if (setupData.roundType === 'qualifier') {
      setLoadingQualifiers(true);
      setQualifierError(null);
      getPlayerQualifiers().then(result => {
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
      });
    } else {
      // Reset qualifier state when switching away from qualifier
      setSelectedQualifierId(null);
      setSelectedRoundNumber(null);
      setAvailableRounds([]);
      setQualifierError(null);
    }
  }, [setupData.roundType]);

  // Fetch available round numbers when qualifier is selected
  useEffect(() => {
    if (selectedQualifierId) {
      getNextQualifierRoundNumber(selectedQualifierId).then(result => {
        if (result.success && result.data) {
          setAvailableRounds(result.data.availableRounds);
          // Auto-select the next round number
          if (result.data.nextRoundNumber > 0) {
            setSelectedRoundNumber(result.data.nextRoundNumber);
          }
        }
      });
    } else {
      setAvailableRounds([]);
      setSelectedRoundNumber(null);
    }
  }, [selectedQualifierId]);

  // Fetch saved courses on mount
  useEffect(() => {
    getPlayerSavedCourses().then(result => {
      setLoadingSavedCourses(false);
      if (result.success) {
        setSavedCourses(result.data);
        // Auto-select "saved" mode if they have saved courses
        if (result.data.length > 0) {
          setCourseMode('saved');
        }
      }
    });
  }, []);

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
      return;
    }

    const course = savedCourses.find(c => c.id === courseId);
    if (course) {
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
      // Update last used timestamp
      touchSavedCourse(courseId);
    }
  };

  // Check for existing draft on mount
  useEffect(() => {
    async function checkDraft() {
      try {
        const result = await checkForDraft();
        if (result.success && result.data.hasDraft && result.data.draftInfo) {
          setExistingDraftInfo(result.data.draftInfo);
          setShowResumeDraftModal(true);
        }
      } catch (err) {
        console.error('[GolfHelm] Failed to check for existing draft:', err);
      } finally {
        setIsCheckingForDraft(false);
      }
    }
    checkDraft();
  }, []);

  // Handle resume draft
  const handleResumeDraft = useCallback(async () => {
    if (!existingDraftInfo) return;

    try {
      const result = await loadDraft();
      if (result.data && result.source) {
        const draftData = result.data;
        // Restore state from draft
        setStep(draftData.step === 'submitting' ? 'tracking' : draftData.step);
        setSetupData(draftData.setupData);
        setHoles(draftData.holes);
        setCompletedHoleStats(draftData.completedHoleStats);
        setCurrentHoleIndex(draftData.currentHoleIndex);
        if (draftData.selectedQualifierId) {
          setSelectedQualifierId(draftData.selectedQualifierId);
        }
        if (draftData.selectedRoundNumber) {
          setSelectedRoundNumber(draftData.selectedRoundNumber);
        }
      }
    } catch (err) {
      console.error('[GolfHelm] Failed to load draft, user will start fresh:', err);
    } finally {
      setShowResumeDraftModal(false);
    }
  }, [existingDraftInfo, loadDraft]);

  // Handle start fresh (delete draft)
  const handleStartFresh = useCallback(async () => {
    if (existingDraftInfo) {
      try {
        await clearRoundDraft(existingDraftInfo.roundId);
      } catch (err) {
        console.error('[GolfHelm] Failed to clear existing draft:', err);
      }
    }
    await clearDraft();
    setExistingDraftInfo(null);
    setShowResumeDraftModal(false);
  }, [existingDraftInfo, clearDraft]);

  // Auto-save draft whenever state changes (30-second intervals via hook)
  useEffect(() => {
    // Don't save if we haven't started (still on setup with no data)
    if (step === 'setup' && !setupData.courseName) {
      return;
    }

    // Don't save while submitting
    if (step === 'submitting') {
      return;
    }

    // Don't save while checking for existing draft
    if (isCheckingForDraft) {
      return;
    }

    // Schedule save with debounce
    const draftData: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex,
      selectedQualifierId,
      selectedRoundNumber,
    };
    scheduleSave(draftData);
  }, [step, setupData, holes, completedHoleStats, currentHoleIndex, selectedQualifierId, selectedRoundNumber, scheduleSave, isCheckingForDraft]);


  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData.courseName) {
      setError('Please enter a course name');
      return;
    }
    // Validate qualifier selection if round type is qualifier
    if (setupData.roundType === 'qualifier') {
      if (!selectedQualifierId) {
        setError('Please select a qualifier');
        return;
      }
      if (!selectedRoundNumber) {
        setError('Please select which round of the qualifier this is');
        return;
      }
    }

    // If using a saved course with hole configs, skip the hole configuration step
    if (preloadedHoleConfigs && preloadedHoleConfigs.length > 0) {
      const initialHoles: Hole[] = preloadedHoleConfigs.map((h) => ({
        number: h.holeNumber,
        par: h.par,
        yardage: h.yardage,
        score: null,
      }));
      setHoles(initialHoles);
      setCompletedHoleStats([]);
      setStep('tracking');
    } else {
      // Go to hole configuration step for new courses
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
    }

    setStep('tracking');
  };

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

    // Move to next hole or finish
    if (holeIndex < holes.length - 1) {
      setCurrentHoleIndex(holeIndex + 1);
    } else {
      // All holes complete, submit round
      await handleRoundSubmit(updatedStats);
    }
  };

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
   * Auto-save handler for shot tracking - persists to database
   * This is called by ShotTrackingComprehensive after each shot entry
   *
   * Note: IndexedDB offline storage is temporarily disabled pending type alignment
   * between ShotRecord and OfflineShot interfaces. The database auto-save still
   * works and will sync when back online.
   */
  const handleAutoSave = useCallback(async (_shots: ShotRecord[], holeIndex: number) => {
    // Trigger the regular auto-save to database (works when online)
    const draftDataForDb: RoundDraftData = {
      step,
      setupData,
      holes,
      completedHoleStats,
      currentHoleIndex: holeIndex,
      selectedQualifierId,
      selectedRoundNumber,
    };
    scheduleSave(draftDataForDb);

    // Update pending counts in case there are any offline items
    await useOfflineSyncStore.getState().updatePendingCount();
  }, [
    step,
    setupData,
    holes,
    completedHoleStats,
    selectedQualifierId,
    selectedRoundNumber,
    scheduleSave,
  ]);

  const handleRoundSubmit = async (allHoleStats: HoleStats[]) => {
    setStep('submitting');
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
        // Include qualifier info if this is a qualifier round
        qualifierId: setupData.roundType === 'qualifier' ? selectedQualifierId ?? undefined : undefined,
        qualifierRoundNumber: setupData.roundType === 'qualifier' ? selectedRoundNumber ?? undefined : undefined,
      };

      const result = await submitGolfRoundComprehensive(roundData);
      if (!result.success) {
        throw new Error(result.error);
      }

      // Clear draft after successful submission
      clearDraft();

      // Navigate to round detail page for full review
      const roundId = result.data.roundId;
      router.push(`/golf/dashboard/rounds/${roundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit round');
      setStep('tracking');
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
      qualifierId: setupData.roundType === 'qualifier' ? selectedQualifierId ?? undefined : undefined,
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

    const result = await savePartialRound(partialRoundData, savedRoundId || undefined);

    if (!result.success) {
      throw new Error(result.error);
    }

    setSavedRoundId(result.data.roundId);

    // Clear local draft since it's saved to database
    try {
      clearDraft();
    } catch {
      // Draft cleanup failure is non-critical - round is already saved to DB
    }
    setShowExitModal(false);

    // Redirect to rounds page and refresh to show the new unfinished round
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

    // Clear local draft only after successful server delete (or no server round)
    clearDraft();
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
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isComplete ? 'bg-green-500 w-full' : isActive ? 'bg-green-400 w-1/2' : 'w-0'
                }`}
                style={{ width: isComplete ? '100%' : isActive ? '50%' : '0%' }}
              />
            </div>
            <span className={`text-xs font-medium ${isActive ? 'text-green-600' : isComplete ? 'text-slate-600' : 'text-slate-400'}`}>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.shortLabel}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  // ============================================================================
  // SETUP STEP
  // ============================================================================
  if (step === 'setup') {
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="relative glass-standard rounded-2xl overflow-hidden p-5 sm:p-8">
            <ShineEffect />
            <StepProgressBar />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
              New Round
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              Track your round shot-by-shot for comprehensive stats
            </p>

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
                <div className="rounded-2xl border border-white/30 bg-white/60 backdrop-blur-sm p-5 shadow-sm">
                  {/* Header with mode toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        {courseMode === 'saved' ? <IconBookmark size={18} /> : <IconPlus size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Course</p>
                        <p className="text-xs text-slate-500">
                          {courseMode === 'saved'
                            ? `${savedCourses.length} saved course${savedCourses.length !== 1 ? 's' : ''}`
                            : 'Enter new course details'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100/80 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCourseMode('saved');
                          setCourseSearchQuery('');
                          if (!selectedCourseId && savedCourses.length > 0) {
                            handleSavedCourseSelect(savedCourses[0]!.id);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          courseMode === 'saved'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        aria-pressed={courseMode === 'saved'}
                      >
                        <IconBookmark size={13} />
                        Saved
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCourseMode('new');
                          setSelectedCourseId(null);
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
                        }}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          courseMode === 'new'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        aria-pressed={courseMode === 'new'}
                      >
                        <IconPlus size={13} />
                        New
                      </button>
                    </div>
                  </div>

                  {/* ── Saved Course: Card Selector ── */}
                  {courseMode === 'saved' && (
                    <div className="mt-4 space-y-3">
                      {/* Search bar — only if 4+ courses */}
                      {savedCourses.length >= 4 && (
                        <div className="relative">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input
                            type="search"
                            value={courseSearchQuery}
                            onChange={(e) => setCourseSearchQuery(e.target.value)}
                            placeholder="Search saved courses..."
                            enterKeyHint="search"
                            autoComplete="off"
                            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200/70 bg-white/80 text-base md:text-sm text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors"
                          />
                        </div>
                      )}

                      {/* Course cards */}
                      <div className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-hide pr-0.5">
                        {filteredSavedCourses.length === 0 ? (
                          <div className="text-center py-6 text-sm text-slate-400">
                            No courses match &ldquo;{courseSearchQuery}&rdquo;
                          </div>
                        ) : (
                          filteredSavedCourses.map((course) => {
                            const isSelected = selectedCourseId === course.id;
                            const totalPar = course.holeConfigs.length > 0 ? computeTotalPar(course.holeConfigs) : null;
                            const location = [course.courseCity, course.courseState].filter(Boolean).join(', ');

                            return (
                              <button
                                key={course.id}
                                type="button"
                                onClick={() => handleSavedCourseSelect(isSelected ? null : course.id)}
                                className={`w-full text-left rounded-xl border p-3.5 transition-all duration-150 ${
                                  isSelected
                                    ? 'border-emerald-400/60 bg-emerald-50/60 ring-2 ring-emerald-500/20 shadow-sm'
                                    : 'border-slate-200/70 bg-white/70 hover:border-slate-300 hover:bg-white/90 hover:shadow-sm'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    {/* Course name */}
                                    <div className="flex items-center gap-2">
                                      {isSelected && (
                                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                          <IconCheck size={12} className="text-white" />
                                        </span>
                                      )}
                                      <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-900' : 'text-slate-900'}`}>
                                        {course.courseName}
                                      </p>
                                    </div>

                                    {/* Location + tees */}
                                    <div className="flex items-center gap-1.5 mt-1">
                                      {location && (
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                          <IconMapPin size={11} className="text-slate-400 flex-shrink-0" />
                                          {location}
                                        </span>
                                      )}
                                      {location && course.teesPlayed && (
                                        <span className="text-slate-300">·</span>
                                      )}
                                      {course.teesPlayed && (
                                        <span className="text-xs text-slate-500">{course.teesPlayed} tees</span>
                                      )}
                                    </div>

                                    {/* Stats row */}
                                    <div className="flex items-center gap-2 mt-2">
                                      {totalPar !== null && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-emerald-100/80 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          Par {totalPar}
                                        </span>
                                      )}
                                      {course.holeConfigs.length > 0 && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-emerald-100/80 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {course.holeConfigs.length} holes
                                        </span>
                                      )}
                                      {course.courseRating !== null && (
                                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
                                          isSelected ? 'bg-emerald-100/80 text-emerald-700' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {course.courseRating}/{course.courseSlope ?? '—'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Last played */}
                                  <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0 pt-0.5">
                                    {formatRelativeTime(course.lastUsedAt)}
                                  </span>
                                </div>
                              </button>
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
                <div className="rounded-2xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/50 to-white/80 backdrop-blur-sm p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <IconCheck size={16} className="text-emerald-600" />
                      Course ready
                    </h2>
                    <button
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
                      className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                  <p className="text-base font-semibold text-slate-900">{selectedCourse.courseName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                    {selectedCourse.courseCity && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={11} className="text-slate-400" />
                        {selectedCourse.courseCity}{selectedCourse.courseState ? `, ${selectedCourse.courseState}` : ''}
                      </span>
                    )}
                    {selectedCourse.teesPlayed && <span>{selectedCourse.teesPlayed} tees</span>}
                    {selectedCourse.courseRating !== null && <span>Rating {selectedCourse.courseRating}</span>}
                    {selectedCourse.courseSlope !== null && <span>Slope {selectedCourse.courseSlope}</span>}
                    {selectedCourse.holeConfigs.length > 0 && (
                      <span className="text-emerald-600 font-medium">
                        {selectedCourse.holeConfigs.length} holes · Par {computeTotalPar(selectedCourse.holeConfigs)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Full form for new course entry */
                <div>
                  <h2 className="text-lg font-medium text-slate-900 mb-4">Course Information</h2>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="courseName" className="text-sm font-medium text-slate-700 block mb-2">
                        Course Name *
                      </label>
                      <input
                        id="courseName"
                        type="text"
                        value={setupData.courseName}
                        onChange={(e) => setSetupData({ ...setupData, courseName: e.target.value })}
                        enterKeyHint="next"
                        autoComplete="off"
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
                        placeholder="Pebble Beach Golf Links"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="courseCity" className="text-sm font-medium text-slate-700 block mb-2">
                          City
                        </label>
                        <input
                          id="courseCity"
                          type="text"
                          value={setupData.courseCity}
                          onChange={(e) => setSetupData({ ...setupData, courseCity: e.target.value })}
                          enterKeyHint="next"
                          autoComplete="off"
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
                          placeholder="Pebble Beach"
                        />
                      </div>
                      <div>
                        <label htmlFor="courseState" className="text-sm font-medium text-slate-700 block mb-2">
                          State
                        </label>
                        <input
                          id="courseState"
                          type="text"
                          value={setupData.courseState}
                          onChange={(e) => setSetupData({ ...setupData, courseState: e.target.value })}
                          enterKeyHint="next"
                          autoComplete="off"
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
                          placeholder="CA"
                          maxLength={2}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="courseRating" className="text-sm font-medium text-slate-700 block mb-2">
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
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
                          placeholder="72.1"
                        />
                      </div>
                      <div>
                        <label htmlFor="courseSlope" className="text-sm font-medium text-slate-700 block mb-2">
                          Slope
                        </label>
                        <input
                          id="courseSlope"
                          type="number"
                          inputMode="numeric"
                          enterKeyHint="next"
                          value={setupData.courseSlope}
                          onChange={(e) => setSetupData({ ...setupData, courseSlope: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
                          placeholder="133"
                          aria-label="Course slope rating"
                        />
                      </div>
                      <div>
                        <label htmlFor="teesPlayed" className="text-sm font-medium text-slate-700 block mb-2">
                          Tees
                        </label>
                        <select
                          id="teesPlayed"
                          value={setupData.teesPlayed}
                          onChange={(e) => setSetupData({ ...setupData, teesPlayed: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white/80 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none transition-colors"
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
                      <button
                        type="button"
                        onClick={() => setSaveCourseChecked(!saveCourseChecked)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-150 ${
                          saveCourseChecked
                            ? 'border-emerald-300/60 bg-emerald-50/50'
                            : 'border-slate-200/70 bg-white/50 hover:bg-white/70'
                        }`}
                      >
                        <div className={`flex-shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          saveCourseChecked
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-slate-300'
                        }`}>
                          {saveCourseChecked && <IconCheck size={12} className="text-white" />}
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-medium ${saveCourseChecked ? 'text-emerald-900' : 'text-slate-700'}`}>
                            Save for quick access next round
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Remembers hole pars, yardages & course details
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Round Info */}
              <div>
                <h2 className="text-lg font-medium text-slate-900 mb-4">Round Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="roundType" className="text-sm font-medium text-slate-700 block mb-2">
                      Round Type
                    </label>
                    <select
                      id="roundType"
                      value={setupData.roundType}
                      onChange={(e) => setSetupData({ ...setupData, roundType: e.target.value as 'practice' | 'tournament' | 'qualifier' })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                    >
                      <option value="practice">Practice</option>
                      <option value="tournament">Tournament</option>
                      <option value="qualifier">Qualifier</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="roundDate" className="text-sm font-medium text-slate-700 block mb-2">
                      Date
                    </label>
                    <input
                      id="roundDate"
                      type="date"
                      value={setupData.roundDate}
                      onChange={(e) => setSetupData({ ...setupData, roundDate: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
                      required
                    />
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
                      <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
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
                        <div className="bg-white/50 rounded-lg p-3 mt-2">
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
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                  <IconChartBar size={18} className="text-green-600" />
                  Comprehensive Stats Tracking
                </h3>
                <p className="text-sm text-green-700">
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
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 font-medium text-white hover:bg-green-700 transition-colors shadow-sm shadow-green-950/10 ring-1 ring-green-700"
                >
                  {preloadedHoleConfigs && preloadedHoleConfigs.length > 0
                    ? 'Start Round →'
                    : 'Next: Configure Holes →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // HOLES CONFIGURATION STEP
  // ============================================================================
  if (step === 'holes') {
    return (
      <div className="min-h-full bg-transparent flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-2xl">
          <div className="relative glass-standard rounded-2xl overflow-hidden p-5 sm:p-8">
            <ShineEffect />
            <StepProgressBar />
            <HoleConfigurationForm
              courseName={setupData.courseName}
              onSave={handleHolesSave}
              onBack={() => setStep('setup')}
            />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUBMITTING STEP
  // ============================================================================
  if (step === 'submitting') {
    const totalScore = completedHoleStats.reduce((sum, h) => sum + h.score, 0);
    const totalPar = completedHoleStats.reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    return (
      <div className="min-h-full bg-transparent flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="relative glass-standard rounded-2xl overflow-hidden p-8 text-center">
            <ShineEffect />
            <div className="w-20 h-20 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Saving Round...
            </h2>
            <p className="text-slate-600 mb-4">
              Score: {totalScore} ({toPar >= 0 ? '+' : ''}{toPar})
            </p>
            <p className="text-sm text-slate-500">
              Calculating your 50+ statistics...
            </p>
            {error && (
              <div className="mt-4">
                <p className="text-sm text-red-600 mb-3">{error}</p>
                <button
                  onClick={() => setStep('tracking')}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  Go Back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TRACKING STEP
  // ============================================================================
  const completedStatsForHole = completedHoleStats[currentHoleIndex];
  const inProgressShots = inProgressShotsByHole[currentHoleIndex] ?? [];
  const activeHoleShots = completedStatsForHole?.shots ?? inProgressShots;
  const activeShotNumber = activeHoleShots.length > 0 ? activeHoleShots.length + 1 : 1;

  return (
    <>
      <ShotTrackingComprehensive
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        onHoleComplete={handleHoleComplete}
        onSaveShot={handleSaveShot}
        onExit={() => setShowExitModal(true)}
        onNavigateToHole={(holeIndex) => setCurrentHoleIndex(holeIndex)}
        initialShots={activeHoleShots}
        initialShotNumber={activeShotNumber}
        onAutoSave={handleAutoSave}
        autoSaveInterval={15000}
      />

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

      {/* Back to Setup - shown when no holes have been completed */}
      {completedHoleStats.filter(s => s?.score != null).length === 0 && (
        <div className="fixed top-4 left-4 z-40">
          <button
            onClick={() => {
              setStep(preloadedHoleConfigs ? 'setup' : 'holes');
              setCurrentHoleIndex(0);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>
      )}

      {/* Save Round Modal */}
      <SaveRoundModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onSaveForLater={handleSaveForLater}
        onDelete={handleDeleteRound}
        currentHole={currentHoleIndex + 1}
        totalHoles={holes.length}
      />

      {/* Resume Draft Modal */}
      {showResumeDraftModal && existingDraftInfo && (
        <ResumeDraftModal
          isOpen={showResumeDraftModal}
          onClose={() => setShowResumeDraftModal(false)}
          onResume={handleResumeDraft}
          onStartFresh={handleStartFresh}
          draftInfo={existingDraftInfo}
        />
      )}
    </>
  );
}
