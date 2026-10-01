'use client';

/**
 * The shot screen's logic, shared by every renderer of it (the Fairway
 * screen today, Clubhouse next): moved unchanged out of
 * components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx, whose
 * header describes it. A renderer passes the same props the screen takes,
 * plus its own haptic, and draws what this returns.
 */

import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';
import { calculateShotDistanceWithDirection, calculateHoleStats } from '@/lib/utils/shot-helpers';
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';
import { useShotStateMachine } from '@/hooks/golf/use-shot-state-machine';
import { usePenaltyHandler } from '@/hooks/golf/use-penalty-handler';
import { useUndoManager } from '@/hooks/golf/use-undo-manager';
import { useEditShotModal } from '@/hooks/golf/use-edit-shot-modal';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { displayToFeet, displayToYards } from '@/lib/golf/distance-units';

// Local alias for the Hole interface used by this component's props
type Hole = RoundHole;

// IDENTICAL to the legacy ShotTrackingProps interface.
export interface ShotTrackingProps {
  /** Resume context already occupies the initial status-bar inset. */
  safeAreaHandledAbove?: boolean;
  /** Round-level status stays in the same measured sticky chrome. */
  statusSlot?: ReactNode;
  holes: Hole[];
  currentHoleIndex: number;
  /**
   * A hole is only considered complete once its parent has durably checkpointed
   * the score and every shot. The caller resolves after that write succeeds.
   */
  /** Resolves true only after the complete hole is durably checkpointed. */
  onHoleComplete: (holeIndex: number, stats: HoleStats) => Promise<boolean>;
  /**
   * Keeps the parent scorecard coherent when a completed hole is edited back
   * into progress. `null` means the hole is no longer holed out.
   */
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats | null) => void | Promise<void>;
  /**
   * Called as each shot is recorded. Returns whether the engine's synchronous device copy of it landed (its emergency save's own
   * answer); a caller with no device copy to report returns nothing, and the screen then makes no claim about where the shot is.
   */
  onSaveShot?: (shot: ShotRecord) => boolean | void;
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

/**
 * Pure conversion-boundary helper for the "distance after this shot" write
 * path — exported for unit testing. Resolves the player-typed display value
 * (in their ACTIVE distance-unit preference) to the canonical yards/feet
 * value the DB stores, deriving the locked canonical unit from shot context
 * alone (never trusted from a free-form unit toggle — see the write-time
 * unit guard comment in handleNextShot below).
 *
 * Meters-mode conversion boundary: before this fix, a meters-preference
 * player's raw typed value (e.g. "9" meaning 9 meters) was written straight
 * into distanceToHoleAfter as if it were already the canonical unit (9 feet
 * instead of the correct ~30 feet) — silently corrupting shot distance,
 * approach proximity and GIR-adjacent stats. `isReadyForNextShot`'s a
 * pared-down validation copy of the same unit resolution lives inline below.
 */
export function resolveDistanceAfterShot(params: {
  rawInput: string;
  isMeters: boolean;
  isPutting: boolean;
  resultOfShot: string;
}): { distanceAfter: number; unitAfter: 'yards' | 'feet' } {
  const { rawInput, isMeters, isPutting, resultOfShot } = params;
  const unitAfter: 'yards' | 'feet' = isPutting || resultOfShot === 'green' ? 'feet' : 'yards';
  const parsedDistance = parseFloat(rawInput.trim());
  const validParsed = Number.isFinite(parsedDistance) && parsedDistance >= 0;

  let distanceAfter: number;
  if (!validParsed) {
    distanceAfter = 0;
  } else if (isMeters) {
    distanceAfter = unitAfter === 'feet'
      ? displayToFeet(parsedDistance, 'meters')
      : displayToYards(parsedDistance, 'meters');
  } else {
    distanceAfter = Math.round(parsedDistance);
  }

  return { distanceAfter, unitAfter };
}

/**
 * What a renderer supplies: its own haptic (Fairway and Clubhouse each have
 * one). Pass a stable function (module-level): it is a dependency of the
 * navigation callbacks, so an inline arrow would recreate them every render.
 */
export interface ShotTrackingPorts {
  haptic: (kind: 'checkpoint') => unknown;
}

export function useShotTracking(
  {
    holes,
    currentHoleIndex,
    onHoleComplete,
    onHoleStatsUpdate,
    onSaveShot,
    onNavigateToHole,
    initialShots = [],
    initialShotNumber = 1,
    onAutoSave,
    autoSaveInterval = 30000, // 30 seconds default,
    autoSaveDisabled = false,
  }: ShotTrackingProps,
  ports: ShotTrackingPorts,
) {
  const { haptic } = ports;
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

  // Distance-unit preference: 'yards' (default) | 'meters'
  // This is a DISPLAY/INPUT-ONLY layer — all canonical state (distanceUnit,
  // distanceAfterUnit) remains 'yards' or 'feet' and is stored to DB unchanged.
  // Legacy parity fix: the Fairway path previously never read this preference,
  // so a meters-preference player's typed input was written to the DB as if it
  // were already yards/feet — corrupting distance/proximity/GIR stats.
  const { distancePref } = useDistanceUnits();
  const isMeters = distancePref === 'meters';

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
  // Undo and Edit Shot are separate sub-hooks with separate UI saving flags.
  // This shared ref serializes their server mutations so a double click or a
  // modal/undo overlap cannot apply two local-history removals to one shot.
  const shotMutationInFlightRef = useRef(false);
  const [holeCheckpointStatus, setHoleCheckpointStatus] = useState<'idle' | 'saving' | 'failed'>('idle');

  // ============================================================================
  // SUB-HOOKS — must be called before any early return (Rules of Hooks)
  // ============================================================================
  // Safe to cast currentHole as RoundHole: if currentHole is undefined, the early
  // return below prevents any handler from ever being called.

  // Every recorded shot (a stroke, a penalty, an errant stroke) reaches the engine here, and the engine's device copy answer is kept
  // for the save line: it may say "Saved on this phone" only for a shot whose device copy landed. A hole-out's own line is the hole
  // checkpoint ("Saving hole N"), which the server confirms before the hole is left, so it makes no claim here.
  const saveShot = useCallback(
    (shot: ShotRecord) => {
      const onDevice = onSaveShot?.(shot);
      // A hole-out that landed on the device claims nothing here; one that did not takes an earlier claim down.
      if (typeof onDevice === 'boolean' && (shot.result !== 'hole' || !onDevice)) dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice } });
    },
    [onSaveShot, dispatch],
  );

  const { handleAddPenalty, confirmPenalty } = usePenaltyHandler({
    state, dispatch, currentHole: currentHole as RoundHole, onSaveShot: saveShot,
  });

  const { handleEditShot, handleCloseEditModal, handleSaveEditedShot, handleDeleteShot } = useEditShotModal({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats, shotMutationInFlightRef,
  });

  const { handleUndoLastShot } = useUndoManager({
    state, dispatch, currentHole: currentHole as RoundHole, currentHoleIndex, onAutoSave, onHoleStatsUpdate, calculateHoleStats, shotMutationInFlightRef,
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
      void haptic('checkpoint');
      onNavigateToHole?.(targetIndex);
    }
  }, [hasUnsavedInput, onNavigateToHole, haptic]);

  const confirmDiscardAndNavigate = useCallback(() => {
    if (pendingNavHoleIndex !== null) {
      void haptic('checkpoint');
      onNavigateToHole?.(pendingNavHoleIndex);
      setPendingNavHoleIndex(null);
    }
  }, [pendingNavHoleIndex, onNavigateToHole, haptic]);

  const completeHole = useCallback(async (shots: ShotRecord[]): Promise<boolean> => {
    if (!currentHole) return false;
    const holeStats = calculateHoleStats(shots, currentHole);
    return onHoleComplete(currentHoleIndex, holeStats);
  }, [currentHole, currentHoleIndex, onHoleComplete]);

  // B8: `handleNextShot` awaits this checkpoint, so its own closure holds
  // whichever `currentHoleIndex` was current when the tap happened. If the
  // player navigates to a different hole (the hole-nav pills allow this
  // mid-save) before that await resolves, the LATEST value is what a
  // still-pending checkpoint's resolution must be checked against — not the
  // captured one, which is always stale by definition once navigation moved.
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;

  // A checkpoint belongs to one hole only. Once navigation moves to a new
  // hole, do not leave stale “saving” or “retry” chrome behind.
  useEffect(() => {
    setHoleCheckpointStatus('idle');
  }, [currentHoleIndex]);

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

      // Validate reasonable distance for green shots (proximity should be < 150 feet / ~46 m)
      if (resultOfShot === 'green') {
        const afterInFeet = isMeters
          ? displayToFeet(parsed, 'meters')
          : (distanceAfterUnit === 'feet' ? parsed : parsed * 3);
        if (afterInFeet > 150) return false; // Can't be 150+ feet from hole and "on the green"
        // B8: "0" is a valid, finite, non-negative number, so it reaches
        // here — but a shot that did not hole out cannot have landed AT the
        // hole. Without this, the primary action looked enabled and tapping
        // it hit `handleNextShot`'s own silent `distanceAfter === 0` bail —
        // a dead tap with no player-facing feedback at all.
        if (afterInFeet <= 0) return false;
      } else {
        // B5: this value becomes the NEXT shot's `distanceToHoleBefore`,
        // capped at 1000 yards by the server's comprehensiveShotSchema
        // (golf.ts) — mirrors FairwayShotEntry's `nextShotBlocker` (see its
        // own doc comment: "mirror isReadyForNextShot() VERBATIM").
        const afterInYards = displayToYards(parsed, distancePref);
        if (afterInYards > 1000) return false;
        // B8: see the matching comment in the green branch above.
        if (afterInYards <= 0) return false;
      }
    }

    // RE-F13: putt break is optional (a tap-in has no read worth logging);
    // an unset break is saved as undefined, never defaulted to "straight".

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

  const handleNextShot = async () => {
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
      // Write-time unit guard + meters-mode conversion boundary: the stored
      // unit is DERIVED from context, never trusted from the input state, and
      // the player-typed value is converted from their active preference to
      // the canonical yards/feet unit before it's ever stored. See
      // resolveDistanceAfterShot's doc comment for the corruption this fixes.
      const resolved = resolveDistanceAfterShot({
        rawInput: distanceAfterShot,
        isMeters,
        isPutting,
        resultOfShot,
      });
      distanceAfter = resolved.distanceAfter;
      unitAfter = resolved.unitAfter;

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

    // RE-F14: no haptic here. The "Next shot" / "Complete hole" tap already
    // answers the hand (FairwayShotEntry + the Fairway Button's own tick);
    // firing a second one from the state machine buzzed twice per shot, and
    // `success` is reserved for the round-submitted moment.

    // Build updated history for callbacks that need it immediately
    const updatedHistory = [...shotHistory, shotRecord];

    saveShot(shotRecord);

    // B8: this checkpoint belongs to whichever hole was current at tap time.
    // The hole-nav pills allow navigating away while it's still in flight;
    // by the time it resolves, `currentHoleIndexRef.current` may already
    // point at a different hole (whose own per-hole reset effect has
    // already set 'idle'). A stale resolution — success or failure — must
    // not overwrite that hole's status with a result that isn't its own.
    const holeIndexAtCheckpointStart = currentHoleIndex;
    try {
      // A hole-out is visible immediately, but it is not eligible to advance
      // until the parent confirms its durable checkpoint. If that save cannot
      // complete, keep the hole review visible with one explicit retry affordance
      // rather than pretending it was saved or showing a persistent banner.
      if (isHoleComplete) {
        setHoleCheckpointStatus('saving');
        const checkpointed = await completeHole(updatedHistory);
        if (currentHoleIndexRef.current === holeIndexAtCheckpointStart) {
          setHoleCheckpointStatus(checkpointed ? 'idle' : 'failed');
        }
        if (!checkpointed) return;
      } else {
        // Update state for next shot
        const newLie = resultOfShot as 'fairway' | 'rough' | 'sand' | 'green' | 'other';
        dispatch({ type: 'UPDATE_AFTER_SHOT', payload: { distanceAfter, unitAfter, newLie } });
      }
    } catch {
      if (isHoleComplete && currentHoleIndexRef.current === holeIndexAtCheckpointStart) {
        setHoleCheckpointStatus('failed');
      }
    } finally {
      // Release the double-tap guard even when a checkpoint rejects. The local
      // snapshot remains intact and the player can use the explicit retry.
      queueMicrotask(() => {
        isProcessingShotRef.current = false;
      });
    }
  };

  const handleRetryHoleCheckpoint = useCallback(async () => {
    // State updates are asynchronous, so the status alone cannot block two taps
    // in the same event turn. Reuse the shot-submit lock so a retry cannot
    // duplicate a completed-hole checkpoint while the first request is pending.
    if (
      isProcessingShotRef.current
      || holeCheckpointStatus === 'saving'
      || shotHistory.length === 0
    ) return;

    // B8: same stale-resolution hazard as handleNextShot above — the
    // player can navigate to a different hole while this retry is still in
    // flight, and its eventual resolution must not overwrite that OTHER
    // hole's status.
    const holeIndexAtCheckpointStart = currentHoleIndexRef.current;
    isProcessingShotRef.current = true;
    setHoleCheckpointStatus('saving');
    try {
      const checkpointed = await completeHole(shotHistory);
      if (currentHoleIndexRef.current === holeIndexAtCheckpointStart) {
        setHoleCheckpointStatus(checkpointed ? 'idle' : 'failed');
      }
    } catch {
      if (currentHoleIndexRef.current === holeIndexAtCheckpointStart) {
        setHoleCheckpointStatus('failed');
      }
    } finally {
      isProcessingShotRef.current = false;
    }
  }, [holeCheckpointStatus, shotHistory, completeHole, isProcessingShotRef]);

  const handleSelectShot = useCallback((shotNumber: number) => {
    dispatch({ type: 'SELECT_SHOT', payload: shotNumber });
    scrollElementIntoView(shotHistoryRefs.current[shotNumber] ?? null);

    const shot = shotHistory.find((entry) => entry.shotNumber === shotNumber);
    if (shot) {
      handleEditShot(shot);
    }
  }, [dispatch, shotHistory, handleEditShot]);

  return {
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
    /** The last background save is on this device only, not on the server yet. */
    autoSaveHeldOnDevice: state.autoSaveHeldOnDevice,
    /** A shot recorded here is on this device (its copy landed) and the server has not acknowledged it yet. */
    autoSaveSyncing: state.autoSaveSyncing,
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
  };
}
