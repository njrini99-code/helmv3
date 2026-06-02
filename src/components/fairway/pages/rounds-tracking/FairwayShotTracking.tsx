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

import { useRef, useState, useCallback } from 'react';
import { calculateShotDistanceWithDirection, calculateHoleStats } from '@/lib/utils/shot-helpers';
import { triggerHaptic } from '@/lib/utils/capacitor';

import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';

import { useShotStateMachine, type EditFormData } from '@/hooks/golf/use-shot-state-machine';
import { usePenaltyHandler } from '@/hooks/golf/use-penalty-handler';
import { useUndoManager } from '@/hooks/golf/use-undo-manager';
import { useEditShotModal } from '@/hooks/golf/use-edit-shot-modal';

import { FairwayScorecardHeader, FairwayDesktopExitHeader } from './FairwayScorecardHeader';
import { FairwayShotPills } from './FairwayShotPills';
import { FairwayHoleHero } from './FairwayHoleHero';
import { FairwayShotEntry } from './FairwayShotEntry';
import { FairwayCompletedHole } from './FairwayCompletedHole';
import { FairwayEditShotModal } from './FairwayEditShotModal';
import { FairwayPenaltyModal } from './FairwayPenaltyModal';
import { FairwayUnsavedNavModal } from './FairwayUnsavedNavModal';

// Local alias for the Hole interface used by this component's props
type Hole = RoundHole;

// IDENTICAL to the legacy ShotTrackingProps interface.
interface ShotTrackingProps {
  holes: Hole[];
  currentHoleIndex: number;
  onHoleComplete: (holeIndex: number, stats: HoleStats) => void;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  onSaveShot?: (shot: ShotRecord) => void;
  onExit?: () => void;
  onNavigateToHole?: (holeIndex: number) => void;
  initialShots?: ShotRecord[];
  initialShotNumber?: number;
  // Auto-save props
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  autoSaveInterval?: number; // in milliseconds, default 30000 (30s)
  /** When true, suppresses all auto-save scheduling (e.g. after round submission) */
  autoSaveDisabled?: boolean;
}

// VERBATIM helper from the legacy file.
function scrollElementIntoView(element: Element | null) {
  element?.scrollIntoView({
    behavior: 'auto',
    block: 'nearest',
    inline: 'center',
  });
}

export default function FairwayShotTracking({
  holes,
  currentHoleIndex,
  onHoleComplete,
  onHoleStatsUpdate,
  onSaveShot,
  onExit,
  onNavigateToHole,
  initialShots = [],
  initialShotNumber = 1,
  onAutoSave,
  autoSaveInterval = 30000, // 30 seconds default
  autoSaveDisabled = false,
}: ShotTrackingProps) {
  const currentHole = holes[currentHoleIndex];

  // ============================================================================
  // STATE MACHINE HOOK
  // ============================================================================

  const {
    state,
    dispatch,
    isProcessingShotRef,
    distanceInputRef,
    shotType,
    isPutting,
    isTeeShot,
    isApproachOrAroundGreen,
  } = useShotStateMachine({
    initialShots,
    initialShotNumber,
    currentHoleIndex,
    currentHole,
    onAutoSave,
    autoSaveInterval,
    autoSaveDisabled,
  });

  // Destructure state for convenience
  const {
    currentShot, shotHistory, distanceToHole, distanceUnit, currentLie,
    usedDriver, resultOfShot, missDirection, puttBreak, puttSlope, puttMissTags,
    approachMissDirection, approachMissLieType, distanceAfterShot, distanceAfterUnit,
    autoSaveStatus, showPenaltyModal, penaltyType,
    showUndoConfirm, undoSaving,
    editingShot, showEditModal, showDeleteConfirm, editFormData, editSaving, editError,
    selectedShotNumber,
  } = state;

  // Local ref for scroll-to-shot in pills
  const shotHistoryRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // ============================================================================
  // SUB-HOOKS — must be called before any early return (Rules of Hooks)
  // ============================================================================
  // Safe to cast currentHole as RoundHole: if currentHole is undefined, the early
  // return below prevents any handler from ever being called.

  const { handleAddPenalty, confirmPenalty } = usePenaltyHandler({
    state, dispatch, currentHole: currentHole as RoundHole, onSaveShot,
  });

  const { handleEditShot, handleCloseEditModal, handleSaveEditedShot, handleDeleteShot } = useEditShotModal({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats,
  });

  const { handleUndoLastShot } = useUndoManager({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats,
  });

  // ============================================================================
  // UNSAVED INPUT WARNING (Issue #18)
  // ============================================================================
  const [pendingNavHoleIndex, setPendingNavHoleIndex] = useState<number | null>(null);

  const hasUnsavedInput = useCallback((): boolean => {
    // If a result has been selected but not yet recorded, there's unsaved input
    return !!resultOfShot;
  }, [resultOfShot]);

  const handleNavigateToHole = useCallback((targetIndex: number) => {
    if (hasUnsavedInput()) {
      setPendingNavHoleIndex(targetIndex);
    } else {
      void triggerHaptic('medium');
      onNavigateToHole?.(targetIndex);
    }
  }, [hasUnsavedInput, onNavigateToHole]);

  const confirmDiscardAndNavigate = useCallback(() => {
    if (pendingNavHoleIndex !== null) {
      void triggerHaptic('medium');
      onNavigateToHole?.(pendingNavHoleIndex);
      setPendingNavHoleIndex(null);
    }
  }, [pendingNavHoleIndex, onNavigateToHole]);

  const completeHole = (shots: ShotRecord[]) => {
    if (!currentHole) return;
    const holeStats = calculateHoleStats(shots, currentHole);
    onHoleComplete(currentHoleIndex, holeStats);
  };

  // ============================================================================
  // DERIVED VALUES & VALIDATION
  // ============================================================================

  const getClubType = (): 'driver' | 'non_driver' | 'putter' => {
    if (isPutting) return 'putter';
    if (isTeeShot && currentHole?.par !== 3 && usedDriver) return 'driver';
    return 'non_driver';
  };

  const isReadyForNextShot = (): boolean => {
    // Must have a result
    if (!resultOfShot) return false;

    // Tee shot on par 4/5 needs driver selection
    if (isTeeShot && currentHole?.par !== 3 && usedDriver === null) return false;

    // Non-hole results need valid distance after
    if (resultOfShot !== 'hole') {
      const trimmed = distanceAfterShot.trim();
      if (!trimmed) return false;

      const parsed = parseFloat(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return false;

      // Validate reasonable distance for green shots (proximity should be < 150 feet)
      if (resultOfShot === 'green') {
        const afterInFeet = distanceAfterUnit === 'feet' ? parsed : parsed * 3;
        if (afterInFeet > 150) return false; // Can't be 150+ feet from hole and "on the green"
      }
    }

    // Putting always needs break (filled before result)
    if (isPutting) {
      if (!puttBreak) return false;
    }

    // Miss direction required for tee shot misses (left/right)
    if (isTeeShot && ['rough', 'sand', 'other'].includes(resultOfShot) && !missDirection) return false;

    // Miss direction required for approach/around-green shots that miss the green
    // This ensures we know WHERE they missed for scrambling analysis
    if (isApproachOrAroundGreen && resultOfShot && !['green', 'hole'].includes(resultOfShot)) {
      if (!approachMissDirection) return false;
    }

    return true;
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleResultSelect = (result: string) => {
    dispatch({ type: 'HANDLE_RESULT_SELECT', payload: { result, isTeeShot, isPutting, isApproachOrAroundGreen } });
  };

  const handleNextShot = () => {
    if (!resultOfShot) return;

    // Concurrency guard: prevent double-tap from recording duplicate shots
    if (isProcessingShotRef.current) return;
    isProcessingShotRef.current = true;

    // Prevent adding shots to an already-completed hole
    if (shotHistory.some(s => s.result === 'hole')) {
      isProcessingShotRef.current = false;
      return;
    }

    // Calculate distances
    let distanceAfter: number;
    let unitAfter: 'yards' | 'feet';

    if (resultOfShot === 'hole') {
      distanceAfter = 0;
      unitAfter = 'feet';
    } else {
      // Parse the distance, handling potential whitespace and ensuring valid number
      const parsedDistance = parseFloat(distanceAfterShot.trim());
      distanceAfter = Number.isFinite(parsedDistance) && parsedDistance >= 0 ? Math.round(parsedDistance) : 0;
      // Write-time unit guard: the stored unit is DERIVED from context, never trusted from
      // the input state. On the green (a putt) or a shot that finished on the green is
      // proximity in FEET; everything else is distance-remaining in YARDS. This makes it
      // structurally impossible to persist the putt-in-yards / on-green-in-yards blend that
      // inflated approach-proximity stats — matching the (now non-interactive) entry label.
      unitAfter = isPutting || resultOfShot === 'green' ? 'feet' : 'yards';

      if (distanceAfter === 0) {
        isProcessingShotRef.current = false;
        return;
      }
    }

    // Calculate shot distance using geometry based on miss direction
    const beforeInYards = distanceUnit === 'feet' ? distanceToHole / 3 : distanceToHole;
    const afterInYards = unitAfter === 'feet' ? distanceAfter / 3 : distanceAfter;
    // Use approachMissDirection for approach/around-green shots, fallback to missDirection
    const effectiveMissDirection = isApproachOrAroundGreen ? (approachMissDirection || missDirection) : missDirection;
    const shotDistance = Math.round(calculateShotDistanceWithDirection(
      beforeInYards,
      afterInYards,
      effectiveMissDirection
    ));

    // Calculate unified miss direction for database storage
    // This populates the miss_direction column used by spray charts and stats
    let unifiedMissDirection: string | undefined;
    if (isPutting && puttMissTags.length > 0) {
      // For putts: use puttMissTags (e.g., 'low', 'high', 'short')
      unifiedMissDirection = puttMissTags.join('_'); // e.g., 'low_short' or just 'low'
    } else if (isApproachOrAroundGreen && approachMissDirection) {
      // For approach/around-green: use approachMissDirection (e.g., 'long_left', 'short_right')
      unifiedMissDirection = approachMissDirection;
    } else if (missDirection) {
      // For tee shots: use missDirection (e.g., 'left', 'right')
      unifiedMissDirection = missDirection;
    }

    // Create shot record
    const shotRecord: ShotRecord = {
      shotNumber: currentShot,
      shotType: shotType,
      clubType: getClubType(),
      lieBefore: currentLie,
      distanceToHoleBefore: distanceToHole,
      distanceUnitBefore: distanceUnit,
      result: resultOfShot,
      distanceToHoleAfter: distanceAfter,
      distanceUnitAfter: unitAfter,
      shotDistance: shotDistance,
      missDirection: unifiedMissDirection, // Unified miss direction for all shot types
      puttBreak: isPutting ? (puttBreak ?? undefined) : undefined,
      puttSlope: isPutting ? (puttSlope ?? undefined) : undefined,
      isPenalty: false,
      // New classification fields
      puttMissTags: isPutting && puttMissTags.length > 0 ? puttMissTags : undefined,
      puttDistanceFeet: isPutting
        ? (distanceUnit === 'yards' ? distanceToHole * 3 : distanceToHole)
        : undefined,
      approachMissDirection: (isApproachOrAroundGreen && approachMissDirection) ? approachMissDirection : undefined,
      approachMissLieType: (isApproachOrAroundGreen && approachMissLieType) ? approachMissLieType : undefined,
    };

    // Record the shot in the reducer
    const isHoleComplete = resultOfShot === 'hole';
    dispatch({ type: 'RECORD_SHOT', payload: { shot: shotRecord, isHoleComplete } });

    // Haptic feedback — subtle for shot, celebratory for hole-out
    void triggerHaptic(isHoleComplete ? 'success' : 'light');

    // Build updated history for callbacks that need it immediately
    const updatedHistory = [...shotHistory, shotRecord];

    onSaveShot?.(shotRecord);

    // Check if hole complete
    if (isHoleComplete) {
      completeHole(updatedHistory);
    }

    if (!isHoleComplete) {
      // Update state for next shot
      const newLie = resultOfShot as 'fairway' | 'rough' | 'sand' | 'green' | 'other';
      dispatch({ type: 'UPDATE_AFTER_SHOT', payload: { distanceAfter, unitAfter, newLie } });
    }

    // Release concurrency guard after dispatches are batched
    queueMicrotask(() => {
      isProcessingShotRef.current = false;
    });
  };

  const handleSelectShot = useCallback((shotNumber: number) => {
    dispatch({ type: 'SELECT_SHOT', payload: shotNumber });
    scrollElementIntoView(shotHistoryRefs.current[shotNumber] ?? null);

    const shot = shotHistory.find((entry) => entry.shotNumber === shotNumber);
    if (shot) {
      handleEditShot(shot);
    }
  }, [dispatch, shotHistory, handleEditShot]);

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
    <div className="min-h-full overflow-x-hidden bg-canvas">
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

      <FairwayScorecardHeader
        holes={holes}
        currentHoleIndex={currentHoleIndex}
        currentHoleNumber={currentHole.number}
        autoSaveStatus={autoSaveStatus}
        onExit={onExit}
        onNavigateToHole={onNavigateToHole ? handleNavigateToHole : undefined}
      />

      {/* MAIN CONTENT — single focused column (hole viz lives in the hero) */}
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 px-4 pb-6 pt-4 sm:px-6">
          <FairwayShotPills
            currentShot={currentShot}
            recordedShotCount={shotHistory.length}
            selectedShotNumber={selectedShotNumber}
            onSelectShot={handleSelectShot}
          />

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

          {isHoleComplete ? (
            <FairwayCompletedHole
              shotHistory={shotHistory}
              currentHole={currentHole}
              showBackToCurrentHole={showBackToCurrentHole}
              nextUnplayedIdx={nextUnplayedIdx}
              onEditShot={handleEditShot}
              onNavigateToHole={handleNavigateToHole}
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
        />
      )}
    </div>
  );
}
