import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => ({ plan: vi.fn(), draft: vi.fn() }));
vi.mock('@/app/golf/actions/practice-plans', () => ({ savePracticePlan: save.plan }));
vi.mock('@/app/golf/actions/coachhelm-practice-plans', () => ({ savePracticePlanDraft: save.draft }));

import { emptyBody } from '../builder-model';
import { useAutosave } from '../useAutosave';

const snap = (title: string) => ({ title, step: 'blocks' as const, body: emptyBody('Lakeside', ['p1'], false), why: {} });

beforeEach(() => {
  vi.useFakeTimers();
  save.plan.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('autosave says why a save failed', () => {
  it('keeps the code and message of the last failure once it stops retrying', async () => {
    save.plan.mockResolvedValue({ success: false, code: 'CH-17104', error: 'A block names a group that isn’t in this plan.' });
    const { result, rerender } = renderHook((s: ReturnType<typeof snap>) => useAutosave({ planId: 'p', version: 1, snapshot: s }), { initialProps: snap('Practice') });
    rerender(snap('Practice, edited'));
    for (const ms of [800, 2000, 2000]) await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
    expect(save.plan).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toEqual({ code: 'CH-17104', message: 'A block names a group that isn’t in this plan.' });
    expect(result.current.unsaved()).toBe(true);
  });

  it('has nothing unsaved and no error after a save lands', async () => {
    save.plan.mockResolvedValue({ success: true, planId: 'p', version: 2, updatedAt: null });
    const { result, rerender } = renderHook((s: ReturnType<typeof snap>) => useAutosave({ planId: 'p', version: 1, snapshot: s }), { initialProps: snap('Practice') });
    rerender(snap('Practice, edited'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(result.current.status).toBe('saved');
    expect(result.current.error).toBeNull();
    expect(result.current.unsaved()).toBe(false);
  });
});
