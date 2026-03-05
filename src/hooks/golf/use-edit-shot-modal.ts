import { useCallback, useRef } from 'react';
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';
import { updateShot, deleteShot, type ShotUpdateData } from '@/app/golf/actions/golf';
import { deriveLieAfterFromResult, calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import type { ShotTrackingState, ShotAction, EditFormData } from './use-shot-state-machine';

interface UseEditShotModalParams {
  state: ShotTrackingState;
  dispatch: React.Dispatch<ShotAction>;
  currentHole: RoundHole;
  currentHoleIndex: number;
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  calculateHoleStats: (shots: ShotRecord[], hole: RoundHole) => HoleStats;
}

export function useEditShotModal({
  state,
  dispatch,
  currentHole,
  currentHoleIndex,
  onAutoSave,
  onHoleStatsUpdate,
  calculateHoleStats,
}: UseEditShotModalParams) {
  // Refs to avoid stale closures in async callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const currentHoleRef = useRef(currentHole);
  currentHoleRef.current = currentHole;
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;
  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;
  const onHoleStatsUpdateRef = useRef(onHoleStatsUpdate);
  onHoleStatsUpdateRef.current = onHoleStatsUpdate;

  const handleEditShot = useCallback((shot: ShotRecord) => {
    const formData: EditFormData = {
      clubType: shot.clubType,
      lieBefore: shot.lieBefore,
      result: shot.result,
      distanceToHoleBefore: String(shot.distanceToHoleBefore),
      distanceUnitBefore: shot.distanceUnitBefore,
      distanceToHoleAfter: String(shot.distanceToHoleAfter),
      distanceUnitAfter: shot.distanceUnitAfter,
      missDirection: shot.missDirection || null,
      puttBreak: shot.puttBreak || null,
      puttSlope: shot.puttSlope || null,
      isPenalty: shot.isPenalty,
      penaltyType: shot.penaltyType || null,
      puttMissTags: shot.puttMissTags || [],
      approachMissDirection: shot.approachMissDirection || null,
      approachMissLieType: shot.approachMissLieType || undefined,
    };
    dispatch({ type: 'OPEN_EDIT_MODAL', payload: { shot, formData } });
  }, [dispatch]);

  const handleCloseEditModal = useCallback(() => {
    dispatch({ type: 'CLOSE_EDIT_MODAL' });
  }, [dispatch]);

  const handleSaveEditedShot = useCallback(async () => {
    const { editingShot, editFormData } = stateRef.current;
    if (!editingShot || !editFormData) return;

    dispatch({ type: 'EDIT_SAVE_START' });

    try {
      const parsedBefore = parseFloat(editFormData.distanceToHoleBefore);
      const parsedAfter = editFormData.result === 'hole' ? 0 : parseFloat(editFormData.distanceToHoleAfter);

      if (!Number.isFinite(parsedBefore) || parsedBefore < 0) {
        dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'Distance before must be a valid positive number' });
        return;
      }
      if (editFormData.result !== 'hole' && (!Number.isFinite(parsedAfter) || parsedAfter < 0)) {
        dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'Distance after must be a valid positive number' });
        return;
      }

      const beforeInYards = editFormData.distanceUnitBefore === 'feet' ? parsedBefore / 3 : parsedBefore;
      const afterInYards = editFormData.distanceUnitAfter === 'feet' ? parsedAfter / 3 : parsedAfter;
      const newShotDistance = Math.round(calculateShotDistanceWithDirection(beforeInYards, afterInYards, editFormData.missDirection));

      const isPuttingShot = editingShot.shotType === 'putting';
      const isApproachType = editingShot.shotType === 'approach' || editingShot.shotType === 'around_green';
      const puttDistanceFeet = isPuttingShot
        ? (editFormData.distanceUnitBefore === 'yards' ? parsedBefore * 3 : parsedBefore)
        : undefined;

      const updatedShot: ShotRecord = {
        ...editingShot,
        clubType: editFormData.clubType,
        lieBefore: editFormData.lieBefore,
        result: editFormData.result,
        distanceToHoleBefore: parsedBefore,
        distanceUnitBefore: editFormData.distanceUnitBefore,
        distanceToHoleAfter: parsedAfter,
        distanceUnitAfter: editFormData.distanceUnitAfter,
        shotDistance: newShotDistance,
        missDirection: editFormData.missDirection || undefined,
        puttBreak: editFormData.puttBreak || undefined,
        puttSlope: editFormData.puttSlope || undefined,
        puttDistanceFeet: isPuttingShot ? puttDistanceFeet : editingShot.puttDistanceFeet,
        isPenalty: editFormData.isPenalty,
        penaltyType: editFormData.isPenalty ? (editFormData.penaltyType as ShotRecord['penaltyType']) : undefined,
        puttMissTags: isPuttingShot ? editFormData.puttMissTags : undefined,
        approachMissDirection: isApproachType ? (editFormData.approachMissDirection || undefined) : undefined,
        approachMissLieType: isApproachType ? editFormData.approachMissLieType : undefined,
      };

      // Update in database if shot has an ID
      if (editingShot.id) {
        const updateData: ShotUpdateData = {
          club_type: editFormData.clubType,
          lie_before: editFormData.lieBefore,
          result: editFormData.result,
          distance_to_hole_before: parsedBefore,
          distance_unit_before: editFormData.distanceUnitBefore,
          distance_to_hole_after: parsedAfter,
          distance_unit_after: editFormData.distanceUnitAfter,
          shot_distance: newShotDistance,
          miss_direction: editFormData.missDirection,
          putt_break: editFormData.puttBreak,
          putt_slope: editFormData.puttSlope,
          putt_distance_feet: isPuttingShot ? puttDistanceFeet ?? null : null,
          putt_made: isPuttingShot ? editFormData.result === 'hole' : null,
          lie_after: deriveLieAfterFromResult(editFormData.result),
          is_penalty: editFormData.isPenalty,
          penalty_type: editFormData.isPenalty ? editFormData.penaltyType : null,
          putt_miss_tags: isPuttingShot ? editFormData.puttMissTags : null,
          approach_miss_direction: isApproachType ? editFormData.approachMissDirection : null,
          approach_miss_lie_type: isApproachType ? editFormData.approachMissLieType ?? null : null,
        };

        const result = await updateShot(editingShot.id, updateData);
        if (!result.success) {
          dispatch({ type: 'EDIT_SAVE_ERROR', payload: result.error || 'Failed to update shot' });
          return;
        }
      }

      // Build updated history with cascade (read latest from ref to avoid stale closure)
      let updatedHistory = stateRef.current.shotHistory.map(s =>
        (editingShot.id ? s.id === editingShot.id : s.shotNumber === editingShot.shotNumber)
          ? updatedShot : s
      );

      // Cascade distance changes to next shot
      const editedIdx = updatedHistory.findIndex(s =>
        editingShot.id ? s.id === editingShot.id : s.shotNumber === editingShot.shotNumber
      );
      if (editedIdx >= 0 && editedIdx < updatedHistory.length - 1) {
        const nextShot = updatedHistory[editedIdx + 1]!;
        const newAfter = updatedShot.distanceToHoleAfter;
        const newAfterUnit = updatedShot.distanceUnitAfter;
        if (nextShot.distanceToHoleBefore !== newAfter || nextShot.distanceUnitBefore !== newAfterUnit) {
          updatedHistory = [...updatedHistory];
          updatedHistory[editedIdx + 1] = {
            ...nextShot,
            distanceToHoleBefore: newAfter,
            distanceUnitBefore: newAfterUnit,
          };
        }

        // Persist cascade to DB (fire-and-forget)
        if (nextShot.id) {
          updateShot(nextShot.id, {
            distance_to_hole_before: newAfter,
            distance_unit_before: newAfterUnit,
          }).catch((err) => { console.warn('[ShotTracking] Cascade distance update failed:', err); });
        }
      }

      dispatch({ type: 'EDIT_SAVE_COMPLETE', payload: { updatedHistory } });

      // Recalculate parent stats if hole is still complete
      const isStillComplete = updatedHistory.length > 0 && updatedHistory[updatedHistory.length - 1]?.result === 'hole';
      if (isStillComplete && onHoleStatsUpdateRef.current) {
        const holeStats = calculateHoleStats(updatedHistory, currentHoleRef.current);
        onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        await onAutoSaveRef.current(updatedHistory, currentHoleIndexRef.current);
      }
    } catch (error) {
      console.error('Error updating shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'An unexpected error occurred' });
    }
  }, [dispatch, calculateHoleStats]);

  const handleDeleteShot = useCallback(async () => {
    const { editingShot } = stateRef.current;
    if (!editingShot) return;

    dispatch({ type: 'EDIT_SAVE_START' });

    try {
      if (editingShot.id) {
        const result = await deleteShot(editingShot.id);
        if (!result.success) {
          dispatch({ type: 'EDIT_SAVE_ERROR', payload: result.error || 'Failed to delete shot' });
          return;
        }
      }

      // Read latest shotHistory from ref after async operation
      const newHistory = stateRef.current.shotHistory
        .filter(s => editingShot.id ? s.id !== editingShot.id : s.shotNumber !== editingShot.shotNumber)
        .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));

      dispatch({ type: 'DELETE_COMPLETE', payload: { newHistory } });

      // Recalculate if hole was complete
      const isStillComplete = newHistory.length > 0 && newHistory[newHistory.length - 1]?.result === 'hole';
      if (isStillComplete && onHoleStatsUpdateRef.current) {
        const holeStats = calculateHoleStats(newHistory, currentHoleRef.current);
        onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        await onAutoSaveRef.current(newHistory, currentHoleIndexRef.current);
      }
    } catch (error) {
      console.error('Error deleting shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'An unexpected error occurred' });
    }
  }, [dispatch, calculateHoleStats]);

  return {
    handleEditShot,
    handleCloseEditModal,
    handleSaveEditedShot,
    handleDeleteShot,
  };
}
