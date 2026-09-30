'use client';

import dynamic from 'next/dynamic';
import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import { OfflineWarningBanner } from '@/components/golf';
import { IconWarning } from '@/components/icons';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayNewRoundEntry } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';
import { Skeleton } from '@/components/fairway';
import { Button as FwButton } from '@/components/fairway/controls/button';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { useNewRoundSession, type NewRoundClientProps } from '@/lib/golf/round-session/use-new-round-session';
// The post-hole decision lives with the engine; its tests import it from here.
export { decidePostHoleCompleteAction, type PostHoleCompleteAction } from '@/lib/golf/round-session/use-new-round-session';


/**
 * Same relative-time style as FairwayUnfinishedBanner's own `relativeTime` —
 * used only by the 36-hole-day conflict prompt's Discard confirm, to show
 * the player when the round they're about to delete was last touched.
 */
function formatConflictUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return '';
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

function RoundCompletionChunkLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--golf-mobile-bottom-nav-offset,0px))] z-[var(--fw-z-toast)] flex justify-center px-4"
    >
      <div className="flex items-center gap-3 rounded-fw-lg border border-border-subtle bg-surface px-4 py-3 font-fw-sans text-body-sm text-text-secondary shadow-fw-modal">
        <Skeleton circle className="h-2.5 w-2.5" />
        <span>Preparing your round…</span>
      </div>
    </div>
  );
}

// Round-completion-only overlays — never rendered until the round is
// finished, so keep them out of the initial hole-entry bundle (perf audit
// 2026-07-09, bundle finding 4). Same no-ssr-flag, .then((m) => m.X) pattern
// as FairwayCalendar.tsx's CalendarFeedManager.
const FairwaySaveRoundModal = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwaySaveRoundModal').then((m) => m.FairwaySaveRoundModal),
);
const FairwayRoundSubmitOverlay = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSubmitOverlay').then((m) => m.FairwayRoundSubmitOverlay),
  { loading: () => <RoundCompletionChunkLoading /> },
);
const FairwayRoundSummarySheet = dynamic(
  () => import('@/components/fairway/pages/rounds-new/FairwayRoundSummarySheet').then((m) => m.FairwayRoundSummarySheet),
  { loading: () => <RoundCompletionChunkLoading /> },
);

export default function NewRoundClient({ playerId }: NewRoundClientProps) {
  const ExitRoundModal = FairwaySaveRoundModal;
  const SubmitOverlay = FairwayRoundSubmitOverlay;
  const {
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
  } = useNewRoundSession({ playerId });
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

  // 36-hole-day follow-up (2026-09-23): shown only during setup/holes, where
  // persistRoundStart runs. All three choices are explicit — nothing here
  // auto-navigates, auto-discards, or auto-starts. Discard itself is a
  // second, destructive step (discardConfirming) — this dialog only ever
  // appears for a round with real progress (an empty shell is reused
  // silently in golf.ts, never surfaced here), so a single mis-tap here
  // would otherwise destroy scored holes with no way back.
  const inProgressConflictDialog = (
    <ModalShell
      open={Boolean(inProgressConflict)}
      onOpenChange={(next) => {
        if (!next) {
          setInProgressConflict(null);
          setDiscardConfirming(false);
        }
      }}
      size="sm"
      title="Round already in progress"
      hideTitle
      hideClose
    >
      <div className="px-6 pb-6 pt-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-fw-md bg-fw-warning-bg">
          <IconWarning size={24} className="text-fw-warning-ink" />
        </div>
        {discardConfirming && inProgressConflict ? (
          <>
            <h2 className="mb-2 text-center font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">
              Discard this round?
            </h2>
            <p className="mb-6 text-center font-fw-sans text-sm text-text-tertiary">
              {inProgressConflict.scoredHoles > 0
                ? `This round has ${inProgressConflict.scoredHoles} scored ${inProgressConflict.scoredHoles === 1 ? 'hole' : 'holes'}`
                : 'This round has no scored holes yet'}
              {inProgressConflict.updatedAt
                ? `, last updated ${formatConflictUpdatedAt(inProgressConflict.updatedAt)}. `
                : '. '}
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <FwButton
                variant="secondary"
                className="flex-1"
                onClick={() => setDiscardConfirming(false)}
                disabled={conflictActionBusy}
              >
                Cancel
              </FwButton>
              <FwButton
                variant="danger"
                className="flex-1"
                onClick={handleConflictConfirmDiscard}
                busy={conflictActionBusy}
              >
                {conflictActionBusy ? 'Discarding' : 'Confirm discard'}
              </FwButton>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-2 text-center font-fw-display text-body-lg font-medium tracking-[-0.012em] text-text-primary">
              Round already in progress
            </h2>
            <p className="mb-6 text-center font-fw-sans text-sm text-text-tertiary">
              You already have an in-progress round for this course and date.
              Resume it, discard it, or start a genuinely separate round, for
              example, a second round on a 36-hole day.
            </p>
            <div className="flex flex-col gap-3">
              <FwButton variant="primary" className="w-full" onClick={handleConflictResume} disabled={conflictActionBusy}>
                Resume
              </FwButton>
              <FwButton
                variant="secondary"
                className="w-full"
                onClick={handleConflictStartNewRound}
                disabled={conflictActionBusy}
              >
                Start a new round
              </FwButton>
              <FwButton
                variant="ghost"
                className="w-full"
                onClick={() => setDiscardConfirming(true)}
                disabled={conflictActionBusy}
              >
                Discard
              </FwButton>
            </div>
          </>
        )}
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
        {inProgressConflictDialog}
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
        <div className={fairwayScope('sticky top-[var(--golf-mobile-header-offset)] z-20 flex items-center justify-between gap-3 bg-accent-fill px-4 py-3 text-text-on-accent-fill lg:top-[49px]')}>
          <p className="font-fw-sans text-sm font-medium">All holes completed. Ready to submit!</p>
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
      {pendingFinalStats && (
        <FairwayRoundSummarySheet
          open={showFinishConfirm}
          onOpenChange={(next) => {
            if (!next) setShowFinishConfirm(false);
          }}
          finalStats={pendingFinalStats}
          courseName={setupData.courseName}
          onGoBack={() => setShowFinishConfirm(false)}
          onSubmit={async () => {
            if (!pendingFinalStats) return;
            setShowFinishConfirm(false);
            await handleRoundSubmit(pendingFinalStats);
          }}
        />
      )}

      {/* Submit Overlay — shows during submission, success celebration, and errors */}
      {step === 'submitting' && (
        <SubmitOverlay
          isVisible
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
      )}

    </>
  );
}
