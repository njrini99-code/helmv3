/**
 * The data-gap prompt's tag save shares the Edit/Undo mutation lock
 * (CoachHelm Slice 8a): while its full-hole snapshot save runs, Undo cannot
 * start, and a tap is refused while Undo holds the lock. The lock is released
 * once the save settles, also when it rejects.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { ShotAction, ShotTrackingState } from '../use-shot-state-machine';
import { usePuttMissTagger } from '../use-putt-miss-tagger';
import { useUndoManager } from '../use-undo-manager';

const actionMocks = vi.hoisted(() => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));

vi.mock('@/app/golf/actions/shot-actions', () => ({
  deleteShot: (...args: unknown[]) => actionMocks.deleteShot(...args),
  updateShot: (...args: unknown[]) => actionMocks.updateShot(...args),
}));

const putt: ShotRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  shotNumber: 1,
  shotType: 'putting',
  clubType: 'putter',
  lieBefore: 'green',
  result: 'green',
  distanceToHoleBefore: 7,
  distanceUnitBefore: 'feet',
  distanceToHoleAfter: 2,
  distanceUnitAfter: 'feet',
  shotDistance: 2,
  isPenalty: false,
} as ShotRecord;

function useHarness(onAutoSave: (shots: ShotRecord[], i: number) => Promise<void>, dispatch: React.Dispatch<ShotAction>) {
  const shotMutationInFlightRef = useRef(false);
  const state = { shotHistory: [putt] } as ShotTrackingState;
  const tag = usePuttMissTagger({
    shotHistory: [putt],
    dispatch,
    onAutoSave,
    currentHoleIndex: 0,
    shotMutationInFlightRef,
  });
  const { handleUndoLastShot } = useUndoManager({
    state,
    dispatch,
    currentHole: {} as RoundHole,
    currentHoleIndex: 0,
    calculateHoleStats: vi.fn(),
    shotMutationInFlightRef,
  } as never);
  return { tag, undo: handleUndoLastShot, lock: shotMutationInFlightRef };
}

describe('usePuttMissTagger and the shared mutation lock', () => {
  it('holds the lock while the tag snapshot saves, so Undo cannot start, then releases it', async () => {
    let finishSave: (() => void) | undefined;
    const onAutoSave = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const { result } = renderHook(() => useHarness(onAutoSave, dispatch));

    let applied = false;
    act(() => { applied = result.current.tag(1, 'short'); });
    expect(applied).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ type: 'TAG_PUTT_MISS', payload: { shotNumber: 1, tags: ['short'] } });
    expect(onAutoSave).toHaveBeenCalledWith([expect.objectContaining({ shotNumber: 1, missDirection: 'short' })], 0);
    expect(result.current.lock.current).toBe(true);

    await act(async () => { await result.current.undo(); });
    expect(actionMocks.deleteShot).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith({ type: 'UNDO_START' });

    await act(async () => { finishSave?.(); await Promise.resolve(); });
    expect(result.current.lock.current).toBe(false);
  });

  it('releases the lock when the background save rejects', async () => {
    const onAutoSave = vi.fn(() => Promise.reject(new Error('offline')));
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const { result } = renderHook(() => useHarness(onAutoSave, dispatch));

    await act(async () => { result.current.tag(1, 'long'); await Promise.resolve(); });
    expect(result.current.lock.current).toBe(false);
  });

  it('refuses a tap while Undo holds the lock', async () => {
    let finishDelete: ((r: { success: true; data: undefined }) => void) | undefined;
    actionMocks.deleteShot.mockImplementationOnce(() => new Promise((resolve) => { finishDelete = resolve; }));
    const onAutoSave = vi.fn(() => Promise.resolve());
    const dispatch = vi.fn<React.Dispatch<ShotAction>>();
    const { result } = renderHook(() => useHarness(onAutoSave, dispatch));

    let undoing: Promise<void>;
    act(() => { undoing = result.current.undo(); });
    expect(result.current.lock.current).toBe(true);

    let applied = true;
    act(() => { applied = result.current.tag(1, 'high'); });
    expect(applied).toBe(false);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TAG_PUTT_MISS' }));
    expect(onAutoSave).not.toHaveBeenCalled();

    finishDelete?.({ success: true, data: undefined });
    await act(async () => { await undoing!; });
  });
});
