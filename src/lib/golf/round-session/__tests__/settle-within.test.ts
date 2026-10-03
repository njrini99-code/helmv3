import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settleWithin } from '../settle-within';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('settleWithin', () => {
  it('resolves with the work when it settles in time, and leaves no timer behind', async () => {
    const result = settleWithin(Promise.resolve('done'), 1000, 'late');
    await expect(result).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves with the fallback when the work is still running at the bound, and does not cancel the work', async () => {
    let finish: (v: string) => void = () => {};
    const work = new Promise<string>((resolve) => (finish = resolve));
    const result = settleWithin(work, 1000, 'late');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('late');
    finish('after');
    await expect(work).resolves.toBe('after');
  });

  it('resolves with the fallback when the work rejects', async () => {
    await expect(settleWithin(Promise.reject(new Error('boom')), 1000, 'fallback')).resolves.toBe('fallback');
    expect(vi.getTimerCount()).toBe(0);
  });
});
