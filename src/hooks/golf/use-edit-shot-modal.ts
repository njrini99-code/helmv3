import { useCallback, useRef } from 'react';
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';
import { updateShot, deleteShot, type ActionResult, type ShotUpdateData } from '@/app/golf/actions/golf';
import { deriveLieAfter, calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import type { ShotTrackingState, ShotAction, EditFormData } from './use-shot-state-machine';

interface UseEditShotModalParams {
  state: ShotTrackingState;
  dispatch: React.Dispatch<ShotAction>;
  currentHole: RoundHole;
  currentHoleIndex: number;
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  /** `null` means an edit reopened a previously completed hole. */
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats | null) => void | Promise<void>;
  calculateHoleStats: (shots: ShotRecord[], hole: RoundHole) => HoleStats;
  /** Shared with Undo so one local round cannot mutate the same shot twice. */
  shotMutationInFlightRef: React.MutableRefObject<boolean>;
}

export function useEditShotModal({
  state,
  dispatch,
  currentHole,
  currentHoleIndex,
  onAutoSave,
  onHoleStatsUpdate,
  calculateHoleStats,
  shotMutationInFlightRef,
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
    if (shotMutationInFlightRef.current) return;

    shotMutationInFlightRef.current = true;
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
        ? Math.min(500, Math.max(0, editFormData.distanceUnitBefore === 'yards' ? parsedBefore * 3 : parsedBefore))
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
          lie_after: deriveLieAfter(updatedShot),
          is_penalty: editFormData.isPenalty,
          penalty_type: editFormData.isPenalty ? editFormData.penaltyType : null,
          putt_miss_tags: isPuttingShot ? editFormData.puttMissTags : null,
          approach_miss_direction: isApproachType ? editFormData.approachMissDirection : null,
          approach_miss_lie_type: isApproachType ? editFormData.approachMissLieType ?? null : null,
        };

        const result = await updateShot(editingShot.id, updateData);
        // `shot_not_found` on the Continue route means the id-keyed point
        // update could not find a matching row — either because a prior
        // full-snapshot save rotated every shot id on this hole, or because
        // the row is momentarily invisible under RLS. Both are indistinguishable
        // from here, and neither means the shot itself is gone: it means the
        // point-update path cannot be trusted for it. The old behavior treated
        // this as proof of deletion and dropped the shot (with the edit never
        // applied) — a silent data-loss bug, since the next full snapshot save
        // would then persist the round WITHOUT this real, unedited shot. Do not
        // return here: fall through and apply the edit locally exactly as the
        // success path does, then let the snapshot save below (`onAutoSave`)
        // persist it — the same path New Round always uses, since its shots
        // never carry a server id to begin with.
        if (!result.success && result.code !== 'shot_not_found') {
          dispatch({ type: 'EDIT_SAVE_ERROR', payload: result.error || 'Failed to update shot' });
          return;
        }
      }

      // Build updated history with cascade (read latest from ref to avoid stale closure)
      let updatedHistory = stateRef.current.shotHistory.map(s =>
        (editingShot.id ? s.id === editingShot.id : s.shotNumber === editingShot.shotNumber)
          ? updatedShot : s
      );

      // Cascade distance changes to downstream shots
      const editedIdx = updatedHistory.findIndex(s =>
        editingShot.id ? s.id === editingShot.id : s.shotNumber === editingShot.shotNumber
      );
      if (editedIdx >= 0 && editedIdx < updatedHistory.length - 1) {
        updatedHistory = [...updatedHistory];
        const cascadeUpdates: Array<Promise<ActionResult<void>>> = [];

        // Walk through all downstream shots and cascade distanceToHoleBefore
        // Each shot's distanceToHoleBefore should match the previous shot's distanceToHoleAfter
        for (let i = editedIdx + 1; i < updatedHistory.length; i++) {
          const prevShot = updatedHistory[i - 1]!;
          const currentShot = updatedHistory[i]!;
          const expectedBefore = prevShot.distanceToHoleAfter;
          const expectedUnit = prevShot.distanceUnitAfter;

          if (currentShot.distanceToHoleBefore !== expectedBefore || currentShot.distanceUnitBefore !== expectedUnit) {
            updatedHistory[i] = {
              ...currentShot,
              distanceToHoleBefore: expectedBefore,
              distanceUnitBefore: expectedUnit,
            };

            // Persist every cascade before releasing the shared mutation gate.
            // A later Undo must not delete a shot while one of these writes is
            // still targeting it.
            if (currentShot.id) {
              cascadeUpdates.push(updateShot(currentShot.id, {
                distance_to_hole_before: expectedBefore,
                distance_unit_before: expectedUnit,
              }));
            }
          } else {
            // Once we find a shot that already matches, downstream shots are consistent
            break;
          }
        }

        const cascadeResults = await Promise.all(cascadeUpdates);
        // Same stale-id/RLS reasoning as the primary update above: a cascade
        // write that cannot find its row by id is not a reason to abandon the
        // whole edit, because the full snapshot save below carries every
        // shot's corrected distances regardless of point-update outcome.
        if (cascadeResults.some((result) => !result.success && result.code !== 'shot_not_found')) {
          dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'Could not save all shot distance updates. Please try again.' });
          return;
        }
      }

      dispatch({ type: 'EDIT_SAVE_COMPLETE', payload: { updatedHistory } });

      // Keep the parent scorecard coherent for BOTH outcomes. An edit can turn
      // the final holed shot back into an in-progress shot; retaining the old
      // completed stat in that case would make a partial save contain a
      // contradictory score and shot map for one hole.
      const isStillComplete = updatedHistory.length > 0 && updatedHistory[updatedHistory.length - 1]?.result === 'hole';
      if (onHoleStatsUpdateRef.current) {
        const holeStats = isStillComplete
          ? calculateHoleStats(updatedHistory, currentHoleRef.current)
          : null;
        await onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        try {
          await onAutoSaveRef.current(updatedHistory, currentHoleIndexRef.current);
        } catch {
          // `onAutoSave` (Continue Round's `handleAutoSave`) now awaits its
          // server save and rethrows an unhandled failure so
          // `useShotStateMachine`'s own circuit breaker can retry it (B3).
          // That rejection reaches here too, but the edit itself and its
          // synchronous device snapshot already succeeded by this point —
          // only the background network save failed, and the state machine
          // is already tracking and retrying it. Do not reopen or error a
          // shot edit the player already completed successfully.
        }
      }
    } catch (error) {
      console.error('Error updating shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'An unexpected error occurred' });
    } finally {
      shotMutationInFlightRef.current = false;
    }
  }, [dispatch, calculateHoleStats, shotMutationInFlightRef]);

  const handleDeleteShot = useCallback(async () => {
    const { editingShot } = stateRef.current;
    if (!editingShot) return;
    if (shotMutationInFlightRef.current) return;

    shotMutationInFlightRef.current = true;
    dispatch({ type: 'EDIT_SAVE_START' });

    try {
      if (editingShot.id) {
        const result = await deleteShot(editingShot.id);
        // The row may already have been deleted by a concurrent local action
        // or an earlier request whose response was lost. Reconcile this
        // client's stale history, but never retry or bypass server auth.
        if (!result.success && result.code !== 'shot_not_found') {
          dispatch({ type: 'EDIT_SAVE_ERROR', payload: result.error || 'Failed to delete shot' });
          return;
        }
      }

      // Read latest shotHistory from ref after async operation
      const newHistory = stateRef.current.shotHistory
        .filter(s => editingShot.id ? s.id !== editingShot.id : s.shotNumber !== editingShot.shotNumber)
        .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));

      dispatch({ type: 'DELETE_COMPLETE', payload: { newHistory } });

      // Deleting the final holed shot reopens the hole. Clear the parent
      // scorecard slot before the next auto-save replays the remaining shots.
      const isStillComplete = newHistory.length > 0 && newHistory[newHistory.length - 1]?.result === 'hole';
      if (onHoleStatsUpdateRef.current) {
        const holeStats = isStillComplete
          ? calculateHoleStats(newHistory, currentHoleRef.current)
          : null;
        await onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        try {
          await onAutoSaveRef.current(newHistory, currentHoleIndexRef.current);
        } catch {
          // See the matching comment in handleSaveEditedShot above — a
          // background save rejection (B3) is not a failed deletion.
        }
      }
    } catch (error) {
      console.error('Error deleting shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'EDIT_SAVE_ERROR', payload: 'An unexpected error occurred' });
    } finally {
      shotMutationInFlightRef.current = false;
    }
  }, [dispatch, calculateHoleStats, shotMutationInFlightRef]);

  return {
    handleEditShot,
    handleCloseEditModal,
    handleSaveEditedShot,
    handleDeleteShot,
  };
}
