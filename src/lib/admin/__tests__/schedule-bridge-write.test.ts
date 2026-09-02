import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The thrown-error path used to `void` its Bridge write and throw. On Vercel
 * that write is a coin flip once the response is sent. These tests pin the two
 * outcomes that replace it: scheduled past the response when a request scope
 * exists, AWAITED (bounded) when one does not — never dropped.
 */
const mocks = vi.hoisted(() => ({
  after: vi.fn<(task: () => Promise<void>) => void>(),
}));
vi.mock('next/server', () => ({ after: mocks.after }));

import { scheduleBridgeWrite, withBoundedTimeout } from '@/lib/admin/schedule-bridge-write';
import { __runWithRequestContextForTests, getRequestId } from '@/lib/admin/request-context';

const outsideRequestScope = () => {
  mocks.after.mockImplementation(() => {
    throw new Error('`after` was called outside a request scope.');
  });
};

describe('scheduleBridgeWrite', () => {
  beforeEach(() => {
    mocks.after.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands the write to after() when a request scope exists, without running it inline', async () => {
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((task) => {
      scheduled.push(task);
    });
    const write = vi.fn(async () => {});

    const how = await scheduleBridgeWrite(write);

    expect(how).toBe('after');
    expect(write).not.toHaveBeenCalled(); // deferred, not dropped
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('AWAITS the write when after() is unavailable — the fallback is the awaited path, never silence', async () => {
    outsideRequestScope();
    let resolved = false;
    const write = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve();
          }, 5);
        }),
    );

    const how = await scheduleBridgeWrite(write);

    expect(how).toBe('awaited');
    expect(write).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(true);
  });

  it('invokes the write SYNCHRONOUSLY on the awaited path, so a caller that does not await still starts it', () => {
    outsideRequestScope();
    const write = vi.fn(async () => {});
    void scheduleBridgeWrite(write);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('bounds the awaited path — a hung Bridge write cannot wedge the caller', async () => {
    vi.useFakeTimers();
    outsideRequestScope();
    const never = vi.fn(() => new Promise<void>(() => {}));

    const pending = scheduleBridgeWrite(never, { timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(pending).resolves.toBe('awaited');
  });

  it('never rejects, whether the write rejects or throws synchronously', async () => {
    outsideRequestScope();
    await expect(scheduleBridgeWrite(async () => { throw new Error('write down'); })).resolves.toBe('awaited');
    await expect(
      scheduleBridgeWrite(() => {
        throw new Error('sync explosion');
      }),
    ).resolves.toBe('awaited');
  });

  it('re-enters the caller\'s correlation scope inside the deferred task', async () => {
    let seenInsideTask: string | null = 'unset';
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((task) => {
      scheduled.push(task);
    });

    await __runWithRequestContextForTests({ requestId: 'req-42', action: 'demo' }, () =>
      scheduleBridgeWrite(async () => {
        seenInsideTask = getRequestId();
      }),
    );
    // after() callbacks run outside the request's ALS continuation — simulate
    // that by invoking the task from a bare context.
    expect(getRequestId()).toBeNull();
    await scheduled[0]!();

    expect(seenInsideTask).toBe('req-42');
  });
});

describe('withBoundedTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves the promise value when it wins', async () => {
    await expect(withBoundedTimeout(Promise.resolve('v'), 50)).resolves.toBe('v');
  });

  it('resolves undefined when the timer wins', async () => {
    vi.useFakeTimers();
    const p = withBoundedTimeout(new Promise<string>(() => {}), 10);
    await vi.advanceTimersByTimeAsync(11);
    await expect(p).resolves.toBeUndefined();
  });
});
