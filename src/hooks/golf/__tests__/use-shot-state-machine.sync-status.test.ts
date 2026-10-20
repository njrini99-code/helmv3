/**
 * @vitest-environment jsdom
 *
 * Owner rule 3 (2026-10-01): the save status tells the truth. "Saved" is said only for what the server acknowledged, and a shot
 * recorded after that acknowledgement (or while its save was in flight) is not covered by it. Before the server answers, the one
 * thing that may be said is where the shot is: on this phone, when the engine's device copy landed.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

vi.mock('@/lib/observability/client-breadcrumbs', () => ({ recordHelmBreadcrumb: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import {
  AutoSaveHeldError,
  HELD_AUTO_SAVE_RESEND_MAX_MS,
  HELD_AUTO_SAVE_RESEND_MS,
  heldResendDelay,
  useShotStateMachine,
} from '@/hooks/golf/use-shot-state-machine';

const HOLE: RoundHole = { number: 1, par: 4, yardage: 400, score: null };
const shotAt = (n: number): ShotRecord => ({
  shotNumber: n,
  shotType: n === 1 ? 'tee' : 'approach',
  clubType: n === 1 ? 'driver' : 'non_driver',
  lieBefore: n === 1 ? 'tee' : 'fairway',
  distanceToHoleBefore: 400 - (n - 1) * 150,
  distanceUnitBefore: 'yards',
  result: 'fairway',
  distanceToHoleAfter: 400 - n * 150,
  distanceUnitAfter: 'yards',
  shotDistance: 150,
  isPenalty: false,
});

function render(onAutoSave: (shots: ShotRecord[], hole: number) => Promise<void>) {
  return renderHook(() =>
    useShotStateMachine({
      initialShots: [shotAt(1)],
      initialShotNumber: 2,
      currentHoleIndex: 0,
      currentHole: HOLE,
      onAutoSave,
      autoSaveInterval: 1000,
    }),
  );
}

type Hook = ReturnType<typeof render>;
const status = (h: Hook) => h.result.current.state.autoSaveStatus;
const syncing = (h: Hook) => h.result.current.state.autoSaveSyncing;
const recordShot = (h: Hook, n: number) =>
  act(() => {
    h.result.current.dispatch({ type: 'RECORD_SHOT', payload: { shot: shotAt(n), isHoleComplete: false } });
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('"saved" never describes a shot the server has not acknowledged', () => {
  it('a shot recorded inside the 2 s the acknowledgement stays up leaves "saved" at once, and the next acknowledgement brings it back', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {});
    const hook = render(onAutoSave);
    await advance(1000);
    expect(status(hook)).toBe('saved');

    await advance(500);
    recordShot(hook, 2);
    // Before the fix this stayed "saved" until the new shot's own save began: the effect's cleanup dropped the timer that cleared it.
    expect(status(hook)).not.toBe('saved');

    await advance(1000);
    expect(onAutoSave).toHaveBeenCalledTimes(2);
    expect(onAutoSave.mock.calls[1]![0]).toHaveLength(2);
    expect(status(hook)).toBe('saved');
  });

  it('the acknowledgement of an older snapshot, arriving after a newer shot, does not read as "saved"', async () => {
    let release: () => void = () => {};
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const hook = render(onAutoSave);
    await advance(1000);
    expect(status(hook)).toBe('saving');

    recordShot(hook, 2);
    onAutoSave.mockImplementation(async () => {});
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(status(hook)).toBe('idle');

    await advance(1000);
    expect(onAutoSave).toHaveBeenCalledTimes(2);
    expect(status(hook)).toBe('saved');
  });
});

describe('the one word before the server answers: on this phone, syncing', () => {
  it('is set by a recorded shot whose device copy landed, and only by that', () => {
    const hook = render(vi.fn(async () => {}));
    expect(syncing(hook)).toBe(false);

    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    expect(syncing(hook)).toBe(true);

    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: false } }));
    expect(syncing(hook)).toBe(false);
  });

  it('a recorded shot also takes an earlier "saved" down', async () => {
    const hook = render(vi.fn(async () => {}));
    await advance(1000);
    expect(status(hook)).toBe('saved');

    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    expect(status(hook)).toBe('idle');
    expect(syncing(hook)).toBe(true);
  });

  it('is cleared by a server acknowledgement of what is on screen, and not before', async () => {
    let release: () => void = () => {};
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const hook = render(onAutoSave);
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    await advance(1000);
    expect(status(hook)).toBe('saving');
    expect(syncing(hook)).toBe(true);

    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(status(hook)).toBe('saved');
    expect(syncing(hook)).toBe(false);
  });

  it('survives a held save that has a device copy, and is dropped by one that has none', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {
      throw new AutoSaveHeldError('offline', true);
    });
    const hook = render(onAutoSave);
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    await advance(1000);
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(true);
    expect(syncing(hook)).toBe(true);

    onAutoSave.mockImplementation(async () => {
      throw new AutoSaveHeldError('offline', false);
    });
    await advance(HELD_AUTO_SAVE_RESEND_MS);
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(false);
    expect(syncing(hook)).toBe(false);
  });

  it('is not carried to another hole (a hole is left only once the server confirmed it)', () => {
    const hook = render(vi.fn(async () => {}));
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    act(() =>
      hook.result.current.dispatch({ type: 'RESET_FOR_HOLE_CHANGE', payload: { initialShots: [], initialShotNumber: 1, holeYardage: 400 } }),
    );
    expect(syncing(hook)).toBe(false);
  });
});

describe('a conflict is held, not saved', () => {
  it('"conflict" is sent again after the resend timer and is "saved" only once the server acknowledges it', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {
      throw new AutoSaveHeldError('conflict', true);
    });
    const hook = render(onAutoSave);
    await advance(1000);
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(status(hook)).not.toBe('saved');
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(true);

    onAutoSave.mockImplementation(async () => {});
    await advance(HELD_AUTO_SAVE_RESEND_MS);
    expect(onAutoSave).toHaveBeenCalledTimes(2);
    expect(onAutoSave.mock.calls[1]![0]).toEqual([shotAt(1)]);
    expect(status(hook)).toBe('saved');
  });
});

describe('nothing on screen waiting for the server means no claim about where a shot is', () => {
  it('a shot recorded and then taken back before its save drops "syncing"', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {});
    const hook = render(onAutoSave);
    await advance(1000);
    recordShot(hook, 2);
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    expect(syncing(hook)).toBe(true);

    // Undo lands back on the acknowledged history: nothing is left to send, so nothing is claimed.
    act(() => hook.result.current.dispatch({ type: 'UNDO_COMPLETE', payload: { newHistory: [shotAt(1)] } }));
    expect(syncing(hook)).toBe(false);
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(false);
  });

  it('undoing the only shot of a hole drops it too', () => {
    const hook = render(vi.fn(async () => {}));
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    act(() => hook.result.current.dispatch({ type: 'UNDO_COMPLETE', payload: { newHistory: [] } }));
    expect(syncing(hook)).toBe(false);
  });

  it('leaves a save in flight alone: its own outcome says what is true', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(() => new Promise<void>(() => {}));
    const hook = render(onAutoSave);
    act(() => hook.result.current.dispatch({ type: 'SHOT_SAVED_ON_DEVICE', payload: { onDevice: true } }));
    await advance(1000);
    expect(status(hook)).toBe('saving');
    act(() => hook.result.current.dispatch({ type: 'AUTO_SAVE_SETTLED' }));
    expect(syncing(hook)).toBe(true);
  });
});

describe('a held save that is a server answer backs off while it repeats', () => {
  it('doubles from the first resend up to a ceiling, and keeps offline and queued flat', () => {
    expect(heldResendDelay('busy', 1)).toBe(HELD_AUTO_SAVE_RESEND_MS);
    expect(heldResendDelay('busy', 2)).toBe(HELD_AUTO_SAVE_RESEND_MS * 2);
    expect(heldResendDelay('conflict', 3)).toBe(HELD_AUTO_SAVE_RESEND_MS * 4);
    expect(heldResendDelay('conflict', 50)).toBe(HELD_AUTO_SAVE_RESEND_MAX_MS);
    expect(heldResendDelay('offline', 9)).toBe(HELD_AUTO_SAVE_RESEND_MS);
    expect(heldResendDelay('queued', 9)).toBe(HELD_AUTO_SAVE_RESEND_MS);
  });

  it('a conflict that keeps answering conflict is not re-sent every 20 s, and a success starts it over', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {
      throw new AutoSaveHeldError('conflict', true);
    });
    render(onAutoSave);
    await advance(1000); // the first save
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    await advance(HELD_AUTO_SAVE_RESEND_MS); // first resend, on time
    expect(onAutoSave).toHaveBeenCalledTimes(2);
    await advance(HELD_AUTO_SAVE_RESEND_MS); // the second waits twice as long: not yet
    expect(onAutoSave).toHaveBeenCalledTimes(2);
    await advance(HELD_AUTO_SAVE_RESEND_MS);
    expect(onAutoSave).toHaveBeenCalledTimes(3);
  });
});
