/**
 * Audit DATA-02: after the class row is saved, a THROWN calendar sync reached
 * AddClassModal's catch, which kept the modal open, and a re-submit inserted a
 * duplicate class. The page now syncs through syncClassSafely, which never
 * throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'throw', calls: [] as unknown[][] }));
vi.mock('@/app/golf/actions/calendar-sync', () => ({
  syncClassToCalendar: async (...a: unknown[]) => {
    state.calls.push(a);
    if (state.mode === 'throw') throw new TypeError('Failed to fetch');
    return { success: true, eventsCreated: 3 };
  },
}));
vi.mock('@/lib/error-logging', () => ({ logError: () => {} }));

import { syncClassSafely } from '../sync-class-safely';

const args = [{} as never, 'class-1', 'player-1', 'team-1'] as const;

beforeEach(() => {
  state.mode = 'ok';
  state.calls = [];
});

describe('syncClassSafely', () => {
  it('passes a result through unchanged', async () => {
    await expect(syncClassSafely(...args)).resolves.toEqual({ success: true, eventsCreated: 3 });
    expect(state.calls).toEqual([[...args]]);
  });

  it('turns a throw into a failed result instead of rejecting', async () => {
    state.mode = 'throw';
    const result = await syncClassSafely(...args);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/did not finish/);
  });
});
