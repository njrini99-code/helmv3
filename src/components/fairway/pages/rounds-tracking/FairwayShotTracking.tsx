'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayShotTracking (logic-bearing parent)
 * ----------------------------------------------------------------------------
 * The flag-gated "Fairway" presentation-only re-skin of
 * src/components/golf/ShotTrackingComprehensive.tsx. It implements the IDENTICAL
 * ShotTrackingProps interface and copies ALL LOGIC VERBATIM — the same hooks in
 * the same order BEFORE the `!currentHole` early return (Rules of Hooks), the
 * same local helpers (handleNextShot, handleSelectShot, handleNavigateToHole,
 * completeHole, getClubType, isReadyForNextShot, hasUnsavedInput,
 * confirmDiscardAndNavigate, updateEditForm), the same refs
 * (isProcessingShotRef, distanceInputRef, shotHistoryRefs), and the
 * pendingNavHoleIndex state. ONLY the JSX + Fairway tokens differ.
 *
 * The ShotRecord build in handleNextShot is preserved BYTE-FOR-BYTE, including
 * the isProcessingShotRef double-tap guard, the bail-on-zero distance, the
 * haptics, the onSaveShot call, completeHole-on-hole, and the queueMicrotask
 * guard release. Result selection ONLY ever dispatches HANDLE_RESULT_SELECT.
 * ========================================================================== */

import { useShotTracking, type ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import { haptic } from '@/lib/haptics';
import { useCallback } from 'react';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import { fwHaptic } from '@/lib/fairway/haptics';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { useHoleSwipe } from './useHoleSwipe';
import { type EditFormData } from '@/hooks/golf/use-shot-state-machine';
import { FairwayScorecardHeader, FairwayDesktopExitHeader } from './FairwayScorecardHeader';
import { FairwayShotPills } from './FairwayShotPills';
import { FairwayHoleHero } from './FairwayHoleHero';
import { FairwayShotEntry } from './FairwayShotEntry';
import { FairwayCompletedHole } from './FairwayCompletedHole';
import { FairwayEditShotModal } from './FairwayEditShotModal';
import { FairwayPenaltyModal } from './FairwayPenaltyModal';
import { FairwayUnsavedNavModal } from './FairwayUnsavedNavModal';

// The logic lives in useShotTracking (shared with Clubhouse); this file draws it.
export { resolveDistanceAfterShot, type ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';

export default function FairwayShotTracking(props: ShotTrackingProps) {
  const {
    safeAreaHandledAbove = false,
    statusSlot,
    holes,
    currentHoleIndex,
    onExit,
    onNavigateToHole,
    onAutoSave,
  } = props;
  const {
    currentHole,
    state,
    dispatch,
    distanceInputRef,
    shotType,
    isPutting,
    isTeeShot,
    isApproachOrAroundGreen,
    currentShot,
    shotHistory,
    distanceToHole,
    distanceUnit,
    currentLie,
    usedDriver,
    resultOfShot,
    missDirection,
    puttBreak,
    puttSlope,
    puttMissTags,
    approachMissDirection,
    distanceAfterShot,
    distanceAfterUnit,
    autoSaveStatus,
    showPenaltyModal,
    penaltyType,
    showUndoConfirm,
    undoSaving,
    editingShot,
    showEditModal,
    showDeleteConfirm,
    editFormData,
    editSaving,
    editError,
    selectedShotNumber,
    holeCheckpointStatus,
    handleAddPenalty,
    confirmPenalty,
    handleEditShot,
    handleCloseEditModal,
    handleSaveEditedShot,
    handleDeleteShot,
    handleUndoLastShot,
    pendingNavHoleIndex,
    setPendingNavHoleIndex,
    hasUnsavedInput,
    handleNavigateToHole,
    confirmDiscardAndNavigate,
    isReadyForNextShot,
    handleResultSelect,
    handleNextShot,
    handleRetryHoleCheckpoint,
    handleSelectShot,
  } = useShotTracking(props, { haptic });


  // ── D-HOLESWIPE (owner decision): swipe between holes ─────────────────────
  // Same reach as the header's Prev/Next: any earlier hole, a later hole once
  // it has a score — plus the frontier (the next unplayed hole), which is
  // where a player reviewing an earlier hole is headed anyway. Unsaved input
  // still routes through the discard prompt. One haptic: the selection tick.
  const reduceMotion = useReducedMotionGuard();
  const frontierIdx = holes.findIndex((h) => h.score === null);
  const swipePrevIdx = currentHoleIndex - 1;
  const swipeNextIdx = currentHoleIndex + 1;
  const canSwipePrev = !!onNavigateToHole && swipePrevIdx >= 0;
  const canSwipeNext = !!onNavigateToHole && swipeNextIdx < holes.length
    && (holes[swipeNextIdx]?.score != null || swipeNextIdx === frontierIdx);
  const swipeToHole = useCallback((targetIndex: number) => {
    if (hasUnsavedInput()) {
      setPendingNavHoleIndex(targetIndex);
      return;
    }
    fwHaptic('selection');
    onNavigateToHole?.(targetIndex);
  }, [hasUnsavedInput, onNavigateToHole, setPendingNavHoleIndex]);
  const holeSwipeRef = useHoleSwipe<HTMLDivElement>({
    canPrev: canSwipePrev,
    canNext: canSwipeNext,
    onPrev: () => swipeToHole(swipePrevIdx),
    onNext: () => swipeToHole(swipeNextIdx),
    enabled: !!onNavigateToHole && !showEditModal && !showPenaltyModal && pendingNavHoleIndex === null,
    reduceMotion,
  });

  // Early return for invalid hole data - must be after all hooks
  if (!currentHole) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas">
        <p className="font-fw-sans text-lg text-text-secondary">Invalid hole data</p>
      </div>
    );
  }

  // Helper for edit modal form data updates
  const updateEditForm = (updates: Partial<EditFormData>) => {
    if (editFormData) {
      dispatch({ type: 'SET_EDIT_FORM_DATA', payload: { ...editFormData, ...updates } });
    }
  };

  // ============================================================================
  // CALCULATIONS FOR DISPLAY
  // ============================================================================

  const isHoleComplete = shotHistory.length > 0 && shotHistory[shotHistory.length - 1]?.result === 'hole';
  const nextUnplayedIdx = holes.findIndex(h => h.score === null);
  const showBackToCurrentHole = isHoleComplete && !!onNavigateToHole && nextUnplayedIdx >= 0 && nextUnplayedIdx !== currentHoleIndex;

  // For sidebar visualization
  const parsedAfterDistance = parseFloat(distanceAfterShot);
  const displayDistance = resultOfShot === 'hole' ? 0 : (Number.isFinite(parsedAfterDistance) && parsedAfterDistance >= 0 ? parsedAfterDistance : distanceToHole);
  const displayUnit = resultOfShot === 'hole' ? 'feet' : (distanceAfterShot ? distanceAfterUnit : distanceUnit);

  // Convert to yards for progress calculation
  const totalYards = currentHole.yardage || 1;
  const remainingYards = displayUnit === 'feet' ? displayDistance / 3 : displayDistance;
  const progressPercent = Math.max(0, Math.min(100, ((totalYards - remainingYards) / totalYards) * 100));

  // Presentation-only derived strings (no logic change vs legacy inline JSX).
  const shotTypeLabel = `${shotType.charAt(0).toUpperCase()}${shotType.slice(1).replace('_', ' ')}`;
  const puttCount = shotHistory.filter((s) => s.shotType === 'putting').length;
  const holeScore = isHoleComplete ? calculateHoleStats(shotHistory, currentHole).score : shotHistory.length;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-full overflow-x-clip bg-canvas">
      {/* Desktop Header with Exit */}
      {onExit && (
        <FairwayDesktopExitHeader
          currentHoleNumber={currentHole.number}
          totalHoles={holes.length}
          shotCount={shotHistory.length}
          autoSaveStatus={autoSaveStatus}
          showAutoSaveStatus={!!onAutoSave}
          onExit={onExit}
        />
      )}

      {/* ONE sticky round-chrome layer. The shot-progress strip used to be a
          SECOND sticky element pinned to `var(--scorecard-height)` and pulled
          full-bleed with negative margins out of the content column — two
          composited layers, two z-index participants, and a JS-measured CSS
          variable re-published on every resize just to keep them touching.
          Passing it as the header's own bottom row makes the round chrome a
          single element that scrolls, sticks and safe-areas as one thing. */}
      <FairwayScorecardHeader
        safeAreaHandledAbove={safeAreaHandledAbove}
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        currentHoleNumber={currentHole.number}
        autoSaveStatus={autoSaveStatus}
        onExit={onExit}
        onNavigateToHole={onNavigateToHole ? handleNavigateToHole : undefined}
        belowSlot={
          <>
            {statusSlot}
            <FairwayShotPills
              currentShot={currentShot}
              recordedShotCount={shotHistory.length}
              selectedShotNumber={selectedShotNumber}
              onSelectShot={handleSelectShot}
            />
          </>
        }
      />

      {/* MAIN CONTENT — full-width column that opens into a calm two-pane layout
          on desktop (hole context left, live shot entry right) so the card no
          longer floats mid-screen with big wasted side margins. The shot pills
          stay full-bleed-sticky at the top of the content column. */}
      <div
        ref={holeSwipeRef}
        data-slot="hole-swipe-surface"
        className="mx-auto w-full min-w-0 max-w-5xl touch-pan-y px-4 pb-6 pt-4 sm:px-6"
      >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
            {/* Hole context — flyover + readouts. Sticks alongside the entry on
                desktop so the live panel can scroll without losing context. */}
            <div className="lg:sticky lg:top-[calc(var(--scorecard-height,105px)+5.5rem)]">
              <FairwayHoleHero
                currentHole={currentHole}
                isHoleComplete={isHoleComplete}
                shotHistory={shotHistory}
                shotHistoryLength={shotHistory.length}
                puttCount={puttCount}
                holeScore={holeScore}
                currentShot={currentShot}
                shotTypeLabel={shotTypeLabel}
                currentLie={currentLie}
                missDirection={missDirection}
                distanceToHole={distanceToHole}
                distanceUnit={distanceUnit}
                progressPercent={progressPercent}
                displayDistance={displayDistance}
                displayUnit={displayUnit}
              />
            </div>

            {/* Live entry / completed review */}
            <div className="min-w-0">
          {isHoleComplete ? (
            <FairwayCompletedHole
              shotHistory={shotHistory}
              currentHole={currentHole}
              checkpointStatus={holeCheckpointStatus}
              showBackToCurrentHole={showBackToCurrentHole}
              nextUnplayedIdx={nextUnplayedIdx}
              onEditShot={handleEditShot}
              onNavigateToHole={handleNavigateToHole}
              onRetryCheckpoint={handleRetryHoleCheckpoint}
            />
          ) : (
            <FairwayShotEntry
              currentHole={currentHole}
              currentShot={currentShot}
              shotHistory={shotHistory}
              isTeeShot={isTeeShot}
              isPutting={isPutting}
              isApproachOrAroundGreen={isApproachOrAroundGreen}
              usedDriver={usedDriver}
              resultOfShot={resultOfShot}
              missDirection={missDirection}
              puttBreak={puttBreak}
              puttSlope={puttSlope}
              puttMissTags={puttMissTags}
              approachMissDirection={approachMissDirection}
              distanceToHole={distanceToHole}
              distanceUnit={distanceUnit}
              distanceAfterShot={distanceAfterShot}
              distanceAfterUnit={distanceAfterUnit}
              isHoleComplete={isHoleComplete}
              undoSaving={undoSaving}
              showUndoConfirm={showUndoConfirm}
              distanceInputRef={distanceInputRef}
              dispatch={dispatch}
              onResultSelect={handleResultSelect}
              isReadyForNextShot={isReadyForNextShot}
              onNextShot={handleNextShot}
              onAddPenalty={handleAddPenalty}
              onUndoLastShot={handleUndoLastShot}
            />
          )}
            </div>
          </div>
      </div>

      {/* Unsaved Input Warning Modal (Issue #18) */}
      <FairwayUnsavedNavModal
        open={pendingNavHoleIndex !== null}
        onStay={() => setPendingNavHoleIndex(null)}
        onDiscard={confirmDiscardAndNavigate}
      />

      {/* Penalty Modal */}
      <FairwayPenaltyModal
        open={showPenaltyModal}
        penaltyType={penaltyType}
        penaltyOrigin={state.penaltyOrigin}
        lastEnteredShot={state.shotHistory[state.shotHistory.length - 1] ?? null}
        currentLie={state.currentLie}
        currentDistance={state.distanceToHole}
        currentUnit={state.distanceUnit}
        dispatch={dispatch}
        onConfirm={confirmPenalty}
      />

      {/* Edit Shot Modal */}
      {showEditModal && editingShot && editFormData && (
        <FairwayEditShotModal
          open={showEditModal}
          editingShot={editingShot}
          editFormData={editFormData}
          showDeleteConfirm={showDeleteConfirm}
          editSaving={editSaving}
          editError={editError}
          dispatch={dispatch}
          updateEditForm={updateEditForm}
          onClose={handleCloseEditModal}
          onSave={handleSaveEditedShot}
          onDelete={handleDeleteShot}
          hole={{ holeNumber: currentHole.number, par: currentHole.par, yardage: currentHole.yardage }}
          shotHistory={shotHistory}
        />
      )}
    </div>
  );
}
