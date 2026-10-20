/**
 * @vitest-environment jsdom
 *
 * Swap audit R-1: a background save that did not reach the server must not
 * read as saved. The round engines' `handleAutoSave` used to RESOLVE when it
 * skipped the server (offline, queued behind another save, busy, refused until
 * a reload, a hole the server refused). The hook took a resolved promise as
 * success: the status said "saved" and the fingerprint was stored, so the same
 * shots were never sent again until another shot was recorded.
 *
 * The engines now throw `AutoSaveHeldError`; the hook keeps the fingerprint
 * unsaved, shows the save as held on the device, never counts it toward the
 * circuit breaker, and sends it again on `online` or after the resend timer.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

vi.mock('@/lib/observability/client-breadcrumbs', () => ({ recordHelmBreadcrumb: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import {
  AutoSaveHeldError,
  HELD_AUTO_SAVE_RESEND_MS,
  isAutoSaveHeld,
  useShotStateMachine,
} from '@/hooks/golf/use-shot-state-machine';

const HOLE: RoundHole = { number: 1, par: 4, yardage: 400, score: null };
const TEE: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 400,
  distanceUnitBefore: 'yards',
  result: 'fairway',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 250,
  isPenalty: false,
};

function render(onAutoSave: (shots: ShotRecord[], hole: number) => Promise<void>) {
  return renderHook(() =>
    useShotStateMachine({
      initialShots: [TEE],
      initialShotNumber: 2,
      currentHoleIndex: 0,
      currentHole: HOLE,
      onAutoSave,
      autoSaveInterval: 1000,
    }),
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a held auto-save (R-1)', () => {
  it('is never shown as saved, and reads as held on the device', async () => {
    const onAutoSave = vi.fn(async () => {
      throw new AutoSaveHeldError('offline', true);
    });
    const hook = render(onAutoSave);
    await advance(1000);

    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.autoSaveStatus).not.toBe('saved');
    expect(hook.result.current.state.autoSaveStatus).toBe('idle');
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(true);
  });

  it('sends the same shots again when the connection comes back, and only then reads as saved', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {
      throw new AutoSaveHeldError('offline', true);
    });
    const hook = render(onAutoSave);
    await advance(1000);
    expect(onAutoSave).toHaveBeenCalledTimes(1);

    onAutoSave.mockImplementation(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onAutoSave).toHaveBeenCalledTimes(2);
    expect(onAutoSave.mock.calls[1]![0]).toEqual([TEE]);
    expect(hook.result.current.state.autoSaveStatus).toBe('saved');
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(false);
  });

  it('sends it again after the resend timer when no online event comes (WKWebView)', async () => {
    const onAutoSave = vi.fn<(shots: ShotRecord[], hole: number) => Promise<void>>(async () => {
      throw new AutoSaveHeldError('busy', true);
    });
    render(onAutoSave);
    await advance(1000);
    onAutoSave.mockImplementation(async () => {});
    await advance(HELD_AUTO_SAVE_RESEND_MS);

    expect(onAutoSave).toHaveBeenCalledTimes(2);
  });

  it('does not resend a save held for a reason a resend cannot clear (refused until reload)', async () => {
    const onAutoSave = vi.fn(async () => {
      throw new AutoSaveHeldError('blocked', true);
    });
    const hook = render(onAutoSave);
    await advance(1000);
    await advance(HELD_AUTO_SAVE_RESEND_MS * 3);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(true);
  });

  it('never opens the circuit breaker or shows an error, however many times it is held', async () => {
    const onAutoSave = vi.fn(async () => {
      throw new AutoSaveHeldError('queued', true);
    });
    const hook = render(onAutoSave);
    await advance(1000);
    for (let i = 0; i < 8; i++) await advance(HELD_AUTO_SAVE_RESEND_MS);

    expect(onAutoSave.mock.calls.length).toBeGreaterThan(5);
    expect(hook.result.current.state.autoSaveStatus).not.toBe('error');
  });

  it('a discarded round is not on the device either', async () => {
    const onAutoSave = vi.fn(async () => {
      throw new AutoSaveHeldError('discarded', false);
    });
    const hook = render(onAutoSave);
    await advance(1000);

    expect(hook.result.current.state.autoSaveStatus).toBe('idle');
    expect(hook.result.current.state.autoSaveHeldOnDevice).toBe(false);
  });

  it('is recognised by kind, not only by class', () => {
    expect(isAutoSaveHeld(new AutoSaveHeldError('offline', true))).toBe(true);
    expect(isAutoSaveHeld({ kind: 'golf.autosave_held', reason: 'offline' })).toBe(true);
    expect(isAutoSaveHeld(new Error('Auto-save server error: x'))).toBe(false);
  });
});
