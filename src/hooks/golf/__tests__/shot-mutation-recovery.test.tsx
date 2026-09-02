import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { ShotAction, ShotTrackingState } from '../use-shot-state-machine';
import { useEditShotModal } from '../use-edit-shot-modal';
import { useUndoManager } from '../use-undo-manager';

const actionMocks = vi.hoisted(() => ({
  deleteShot: vi.fn(),
  updateShot: vi.fn(),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  deleteShot: (...args: unknown[]) => actionMocks.deleteShot(...args),
  updateShot: (...args: unknown[]) => actionMocks.updateShot(...args),
}));

const SHOT_ID = '11111111-1111-4111-8111-111111111111';

function makeShot(): ShotRecord {
  return {
    id: SHOT_ID,
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    result: 'fairway',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    shotDistance: 250,
    isPenalty: false,
  } as ShotRecord;
}

function makeState(shot: ShotRecord): ShotTrackingState {
  return {
    shotHistory: [shot],
    editingShot: shot,
  } as ShotTrackingState;
}

function useDeleteHandlers(state: ShotTrackingState, dispatch: React.Dispatch<ShotAction>) {
  const shotMutationInFlightRef = useRef(false);
  const common = {
    state,
    dispatch,
    currentHole: {} as RoundHole,
    currentHoleIndex: 0,
    calculateHoleStats: vi.fn(),
    // The shared ref is intentionally passed to both entry points. The first
    // test is the regression that required the production hooks to honor it.
    shotMutationInFlightRef,
  };

  return {
    undo: useUndoManager(common as never).handleUndoLastShot,
    deleteFromEditor: useEditShotModal(common as never).handleDeleteShot,
  };
}

function useEditSaveHandler(state: ShotTrackingState, dispatch: React.Dispatch<ShotAction>) {
  const shotMutationInFlightRef = useRef(false);
  return useEditShotModal({
    state,
    dispatch,
    currentHole: {} as RoundHole,
    currentHoleIndex: 0,
    calculateHoleStats: vi.fn(),
    shotMutationInFlightRef,
  } as never).handleSaveEditedShot;
}

describe('shot mutation recovery', () => {
  it('allows only one destructive shot mutation while an Undo request is pending', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    let resolveDelete: ((result: { success: true; data: undefined }) => void) | undefined;
    actionMocks.deleteShot.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelete = resolve; }),
    );

    const { result } = renderHook(() => useDeleteHandlers(makeState(shot), dispatch));

    let undoPromise: Promise<void>;
    let editorDeletePromise: Promise<void>;
    act(() => {
      undoPromise = result.current.undo();
      editorDeletePromise = result.current.deleteFromEditor();
    });

    expect(actionMocks.deleteShot).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'UNDO_START' });
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'EDIT_SAVE_START' });

    resolveDelete?.({ success: true, data: undefined });
    await act(async () => {
      await Promise.all([undoPromise!, editorDeletePromise!]);
    });
  });

  it('reconciles an already-absent server shot instead of leaving Undo blocked', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    actionMocks.deleteShot.mockResolvedValueOnce({
      success: false,
      error: 'Shot not found',
      code: 'shot_not_found',
    });

    const { result } = renderHook(() => useDeleteHandlers(makeState(shot), dispatch));

    await act(async () => {
      await result.current.undo();
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'UNDO_COMPLETE',
      payload: { newHistory: [] },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'UNDO_FAIL' }));
  });

  it('does not remove a shot when Undo cannot verify it on the server', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    actionMocks.deleteShot.mockResolvedValueOnce({
      success: false,
      error: 'Failed to verify shot. Please try again.',
    });

    const { result } = renderHook(() => useDeleteHandlers(makeState(shot), dispatch));

    await act(async () => {
      await result.current.undo();
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'UNDO_FAIL' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'UNDO_COMPLETE' }));
  });

  it('keeps the edited shot — with the edit applied — and persists it through the snapshot path when the server cannot find it by id (B1)', async () => {
    // Shot ids rotate on every full-snapshot save (save_partial_round_atomic /
    // submit_round_atomic DELETE-then-INSERT the round's holes and shots).
    // A point update against a stale id returning `shot_not_found` does NOT
    // mean the shot is gone — it means the id-keyed RPC cannot find it. The
    // pre-fix behavior here dropped the shot entirely (RECONCILE_MISSING_SHOT
    // with the shot filtered out) and never applied the edit, silently
    // erasing real, unedited shot data the next time a full snapshot saved.
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    actionMocks.updateShot.mockResolvedValueOnce({
      success: false,
      error: 'Shot not found',
      code: 'shot_not_found',
    });
    const state = {
      ...makeState(shot),
      editFormData: {
        clubType: 'driver',
        lieBefore: 'tee',
        result: 'fairway',
        distanceToHoleBefore: '380',
        distanceUnitBefore: 'yards',
        distanceToHoleAfter: '150',
        distanceUnitAfter: 'yards',
        missDirection: null,
        puttBreak: null,
        puttSlope: null,
        isPenalty: false,
        penaltyType: null,
        puttMissTags: [],
        approachMissDirection: null,
        approachMissLieType: undefined,
      },
    } as ShotTrackingState;

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state,
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      } as never).handleSaveEditedShot;
    });

    await act(async () => {
      await result.current();
    });

    // The edit (distance changed to 380) is applied, not the shot dropped.
    expect(dispatch).toHaveBeenCalledWith({
      type: 'EDIT_SAVE_COMPLETE',
      payload: {
        updatedHistory: [expect.objectContaining({ id: SHOT_ID, distanceToHoleBefore: 380 })],
      },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECONCILE_MISSING_SHOT' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_ERROR' }));
    // The correction reaches the server through the full snapshot path —
    // the same mechanism New Round relies on for shots that never had an id.
    expect(onAutoSave).toHaveBeenCalledWith(
      [expect.objectContaining({ id: SHOT_ID, distanceToHoleBefore: 380 })],
      0,
    );
  });

  it('keeps the edit applied when the row is hidden rather than absent (RLS-hidden case, B1)', async () => {
    // The server cannot distinguish, from the client's point of view, between
    // "this row was really replaced by a rotated id" and "this row exists but
    // RLS hid it from this read" — both surface as the identical
    // `shot_not_found` result. The fix is intentionally code-path agnostic:
    // it must never guess which case it is and must never lose the edit for
    // either one.
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    actionMocks.updateShot.mockResolvedValueOnce({
      success: false,
      error: 'Shot not found',
      code: 'shot_not_found',
    });
    const state = {
      ...makeState(shot),
      editFormData: {
        clubType: 'non_driver',
        lieBefore: 'fairway',
        result: 'green',
        distanceToHoleBefore: '150',
        distanceUnitBefore: 'yards',
        distanceToHoleAfter: '20',
        distanceUnitAfter: 'feet',
        missDirection: null,
        puttBreak: null,
        puttSlope: null,
        isPenalty: false,
        penaltyType: null,
        puttMissTags: [],
        approachMissDirection: null,
        approachMissLieType: undefined,
      },
    } as ShotTrackingState;

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state,
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      } as never).handleSaveEditedShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_COMPLETE' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECONCILE_MISSING_SHOT' }));
    expect(onAutoSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the local shot intact when the server could not verify it', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    actionMocks.updateShot.mockResolvedValueOnce({
      success: false,
      error: 'Failed to verify shot. Please try again.',
    });
    const state = {
      ...makeState(shot),
      editFormData: {
        clubType: 'driver', lieBefore: 'tee', result: 'fairway',
        distanceToHoleBefore: '400', distanceUnitBefore: 'yards',
        distanceToHoleAfter: '150', distanceUnitAfter: 'yards',
        missDirection: null, puttBreak: null, puttSlope: null,
        isPenalty: false, penaltyType: null, puttMissTags: [],
        approachMissDirection: null, approachMissLieType: undefined,
      },
    } as ShotTrackingState;

    const { result } = renderHook(() => useEditSaveHandler(state, dispatch));

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'EDIT_SAVE_ERROR',
      payload: 'Failed to verify shot. Please try again.',
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECONCILE_MISSING_SHOT' }));
  });

  it('clears the parent completed-hole slot when deleting the final holed shot', async () => {
    const shot: ShotRecord = { ...makeShot(), result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet' };
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onHoleStatsUpdate = vi.fn();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    actionMocks.deleteShot.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state: makeState(shot),
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onHoleStatsUpdate,
        onAutoSave,
        shotMutationInFlightRef,
      }).handleDeleteShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(onHoleStatsUpdate).toHaveBeenCalledWith(0, null);
    expect(onAutoSave).toHaveBeenCalledWith([], 0);
  });

  it('applies a Delete the user asked for and persists it through the snapshot path when the id is stale (B1 regression)', async () => {
    // Unlike Edit, Delete's intent IS removal, so reconciling to "shot gone"
    // on shot_not_found is correct here — but it must still reach the server
    // through a full snapshot save, not stop at the local dispatch.
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    actionMocks.deleteShot.mockResolvedValueOnce({
      success: false,
      error: 'Shot not found',
      code: 'shot_not_found',
    });

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state: makeState(shot),
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      }).handleDeleteShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_COMPLETE', payload: { newHistory: [] } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_ERROR' }));
    expect(onAutoSave).toHaveBeenCalledWith([], 0);
  });

  it('applies an Undo the user asked for and persists it through the snapshot path when the id is stale (B1 regression)', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    actionMocks.deleteShot.mockResolvedValueOnce({
      success: false,
      error: 'Shot not found',
      code: 'shot_not_found',
    });

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useUndoManager({
        state: makeState(shot),
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      }).handleUndoLastShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'UNDO_COMPLETE', payload: { newHistory: [] } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'UNDO_FAIL' }));
    expect(onAutoSave).toHaveBeenCalledWith([], 0);
  });

  // Continue Round's `onAutoSave` (`handleAutoSave`) now AWAITS its server
  // save and rethrows an unhandled failure so `useShotStateMachine`'s own
  // circuit breaker can retry it (B3). That rejection now reaches these
  // handlers too, since they also `await onAutoSaveRef.current(...)`. The
  // local mutation and its synchronous device snapshot both already
  // succeeded by that point — only the background network save failed, and
  // the state machine is already tracking and retrying it. Treating that as
  // a FAILED mutation here would be wrong: it would reopen/error a shot edit
  // that the player already completed successfully.
  it('does not surface a background autosave rejection as a failed Edit (B3 x B1)', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockRejectedValue(new Error('Auto-save server error: retry'));
    actionMocks.updateShot.mockResolvedValueOnce({ success: true, data: undefined });
    const state = {
      ...makeState(shot),
      editFormData: {
        clubType: 'driver', lieBefore: 'tee', result: 'fairway',
        distanceToHoleBefore: '400', distanceUnitBefore: 'yards',
        distanceToHoleAfter: '150', distanceUnitAfter: 'yards',
        missDirection: null, puttBreak: null, puttSlope: null,
        isPenalty: false, penaltyType: null, puttMissTags: [],
        approachMissDirection: null, approachMissLieType: undefined,
      },
    } as ShotTrackingState;

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state,
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      } as never).handleSaveEditedShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_COMPLETE' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_ERROR' }));
  });

  it('does not surface a background autosave rejection as a failed Delete (B3 x B1)', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockRejectedValue(new Error('Auto-save server error: retry'));
    actionMocks.deleteShot.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useEditShotModal({
        state: makeState(shot),
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      }).handleDeleteShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_COMPLETE', payload: { newHistory: [] } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_ERROR' }));
  });

  it('does not surface a background autosave rejection as a failed Undo (B3 x B1)', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const onAutoSave = vi.fn().mockRejectedValue(new Error('Auto-save server error: retry'));
    actionMocks.deleteShot.mockResolvedValueOnce({ success: true, data: undefined });

    const { result } = renderHook(() => {
      const shotMutationInFlightRef = useRef(false);
      return useUndoManager({
        state: makeState(shot),
        dispatch,
        currentHole: {} as RoundHole,
        currentHoleIndex: 0,
        calculateHoleStats: vi.fn(),
        onAutoSave,
        shotMutationInFlightRef,
      }).handleUndoLastShot;
    });

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({ type: 'UNDO_COMPLETE', payload: { newHistory: [] } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'UNDO_FAIL' }));
  });
});
