import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const steps = vi.hoisted(() => ({ order: [] as string[], teardownMs: 0 }));
vi.mock('@/lib/utils/push-registration', () => ({
  teardownDeviceTokenOnSignOut: () =>
    new Promise<void>((done) =>
      setTimeout(() => {
        steps.order.push('teardown done');
        done();
      }, steps.teardownMs),
    ),
}));
vi.mock('@/lib/golf/client-resource-cache', () => ({ clearAllCachedResources: () => {} }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: async () => ({ error: null }) } }) }));
vi.mock('../track', () => ({ chReport: () => {} }));

import { CH_PUSH_TEARDOWN_WAIT_MS, chSignOut } from '../sign-out';

let replace: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  steps.order.length = 0;
  replace = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, replace } });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    steps.order.push('session ended');
    return new Response('{"success":true}', { status: 200 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('chSignOut', () => {
  it('ends the session only once the push token is switched off (a slow one included)', async () => {
    steps.teardownMs = 900;
    const done = chSignOut();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(steps.order).toEqual(['teardown done', 'session ended']);
    expect(replace).toHaveBeenCalledWith('/golf/login');
  });

  it('never waits on the token longer than 1.5s: the person is signed out regardless', async () => {
    steps.teardownMs = 10_000;
    const done = chSignOut();
    await vi.advanceTimersByTimeAsync(CH_PUSH_TEARDOWN_WAIT_MS + 10);
    await done;
    expect(steps.order).toEqual(['session ended']);
    expect(replace).toHaveBeenCalledWith('/golf/login');
  });
});
