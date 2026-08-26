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

  it('removes a server-deleted shot from Edit instead of surfacing a false save failure', async () => {
    const shot = makeShot();
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
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
        distanceToHoleBefore: '400',
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

    const { result } = renderHook(() => useEditSaveHandler(state, dispatch));

    await act(async () => {
      await result.current();
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: 'RECONCILE_MISSING_SHOT',
      payload: { newHistory: [] },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EDIT_SAVE_ERROR' }));
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
});
