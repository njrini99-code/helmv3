'use client';

import { type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import type { HoleStats } from '@/lib/types/golf';
import { useToast } from '@/components/ui/sonner';
import { useOfflineSyncStore } from '@/stores/offline-sync-store';
import { OfflineIndicator } from '@/components/golf/OfflineIndicator';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayShotTracking } from '@/components/fairway/pages/rounds-tracking';
import { Skeleton } from '@/components/fairway';
import { Button as FwButton } from '@/components/fairway/controls/button';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import {
  useContinueRoundSession,
  type ContinueRoundSessionProps,
} from '@/lib/golf/round-session/use-continue-round-session';

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

interface ContinueRoundClientProps extends ContinueRoundSessionProps {
  roundTypeEditor?: ReactNode;
  /** Safe, server-derived choices for a legacy qualifier row missing its number. */
  qualifierRoundNumberOptions?: number[];
  /** Explains why a legacy row cannot currently choose a safe result number. */
  qualifierRoundNumberUnavailableReason?: string;
}

export default function ContinueRoundClient({
  roundTypeEditor,
  qualifierRoundNumberOptions = [],
  qualifierRoundNumberUnavailableReason,
  ...session
}: ContinueRoundClientProps) {
  const { setupData } = session;
  // The engine's port: the same function it used to get from this hook, every render (ROUNDS_PLAN step 5c).
  const { showToast } = useToast();
  // Mirrors new-round-client so the resume flow shares the exact same
  // exit-sheet + submit overlay as a fresh round.
  const ExitRoundModal = FairwaySaveRoundModal;
  const SubmitOverlay = FairwayRoundSubmitOverlay;
  const {
    syncStatus,
    currentHoleIndex,
    setCurrentHoleIndex,
    holes,
    completedHoleStats,
    error,
    submitting,
    showExitModal,
    setShowExitModal,
    pendingFinalStats,
    showFinishConfirm,
    setShowFinishConfirm,
    completedRoundId,
    qualifierClosed,
    selectedQualifierRoundNumber,
    setSelectedQualifierRoundNumber,
    showQualifierRoundNumberDialog,
    roundConflictBlocked,
    showRecoveryDialog,
    setShowRecoveryDialog,
    recoveryData,
    handleHoleComplete,
    handleHoleStatsUpdate,
    handleSaveShot,
    handleAutoSave,
    handleSaveAsPractice,
    requestRoundSubmission,
    handleSaveForLater,
    activeHoleShots,
    activeShotNumber,
    handleDeleteRound,
    handleDiscardRecovery,
    handleRestoreRecovery,
    handleQualifierRoundDialogChange,
    handleQualifierRoundBack,
    handleQualifierRoundSubmit,
    handleSubmitGoBack,
    handleSubmitRetry,
    handleSubmitSaveAndExit,
    handleSubmitDiscard,
  } = useContinueRoundSession({ ...session, ports: { showToast } });
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
      <header data-testid="continue-round-context" className={fairwayScope('bg-surface border-b border-border-subtle px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]')}>
        <div className="max-w-[720px] mx-auto flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-fw-md bg-accent-50 text-accent-700 ring-1 ring-accent-200">
            <svg className="h-5 w-5 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-fw-sans text-caption font-medium text-text-tertiary">Continue round</p>
            <p className="truncate font-fw-display text-body-lg font-semibold tracking-[-0.012em] text-text-primary">
              {setupData.courseName}
            </p>
          </div>
          <div className="flex-shrink-0 rounded-fw-sm bg-surface-sunken px-2.5 py-1.5 text-right">
            <p className="font-fw-mono text-caption font-medium tabular-nums text-text-secondary">
              {completedHoleStats.filter(s => s != null).length}/{holes.length}
            </p>
            <p className="font-fw-sans text-microlabel uppercase tracking-wide text-text-tertiary">saved</p>
          </div>
        </div>
        {roundTypeEditor && (
          <div className="max-w-[720px] mx-auto mt-2">{roundTypeEditor}</div>
        )}
      </header>

      {/* Error Display — Fairway danger tokens. A conflict block additionally
          gets a Reload control: "reload to continue" must name a dead end
          the player can act on right here, not just describe one. */}
      {error && (
        <div className={fairwayScope('max-w-[720px] mx-auto px-4 py-4')}>
          <div role="alert" className="bg-fw-danger-bg border border-fw-danger/30 text-fw-danger-ink px-4 py-3 rounded-fw-md font-fw-sans text-body-sm">
            <p>{error}</p>
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

      {/* Shot Tracking — presentation only, no mutation/autosave logic moves. */}
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayShotTracking
          safeAreaHandledAbove
          statusSlot={
            pendingFinalStats && !showFinishConfirm && !submitting && (
              <div className={fairwayScope('on-dark bg-nav-bg px-4 py-3 text-nav-text flex items-center justify-between gap-3')}>
                <p className="font-fw-sans text-body-sm font-medium text-nav-text">All holes entered. Ready to submit.</p>
                <FwButton
                  variant="primary"
                  size="sm"
                  onClick={() => setShowFinishConfirm(true)}
                  className="flex-shrink-0"
                >
                  Submit Round
                </FwButton>
              </div>
            )
          }
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
                onClick={handleDiscardRecovery}
                className="flex-1"
              >
                Discard
              </FwButton>
              <FwButton variant="primary"
                onClick={handleRestoreRecovery}
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
        onOpenChange={handleQualifierRoundDialogChange}
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
              onClick={handleQualifierRoundBack}
            >
              Back
            </FwButton>
            <FwButton
              type="button"
              variant="primary"
              className="flex-1"
              disabled={selectedQualifierRoundNumber == null || !pendingFinalStats}
              onClick={handleQualifierRoundSubmit}
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
        onGoBack={handleSubmitGoBack}
        onRetry={qualifierClosed ? undefined : (pendingFinalStats ? handleSubmitRetry : undefined)}
        secondaryActionLabel={qualifierClosed ? 'Save as practice round' : undefined}
        onSecondaryAction={qualifierClosed ? handleSaveAsPractice : undefined}
        onSaveAndExit={handleSubmitSaveAndExit}
        onDiscard={handleSubmitDiscard}
      />

    </>
  );
}
