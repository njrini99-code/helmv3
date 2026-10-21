import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPrivateServiceWorkerCaches, isPrivateServiceWorkerCache, PRIVATE_CACHE_CLEAR_WAIT_MS } from '../private-caches';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('clearPrivateServiceWorkerCaches', () => {
  it("deletes the worker's page and API caches and keeps static build assets", async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: async () => ['golfhelm-vabc-static', 'golfhelm-vabc-dynamic', 'golfhelm-vabc-api', 'golfhelm-vsource-dynamic', 'someone-elses-cache'],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    await clearPrivateServiceWorkerCaches();
    expect(deleted.sort()).toEqual(['golfhelm-vabc-api', 'golfhelm-vabc-dynamic', 'golfhelm-vsource-dynamic']);
  });

  it('never throws when the cache store refuses', async () => {
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('SecurityError');
      },
      delete: async () => true,
    });
    await expect(clearPrivateServiceWorkerCaches()).resolves.toBeUndefined();
  });

  it('does not hold a sign-out up when a delete never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('caches', { keys: async () => ['golfhelm-v1-dynamic'], delete: () => new Promise(() => {}) });
    let settled = false;
    const done = clearPrivateServiceWorkerCaches().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(PRIVATE_CACHE_CLEAR_WAIT_MS + 5);
    await done;
    expect(settled).toBe(true);
  });

  it('is a no-op where there is no cache store', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(clearPrivateServiceWorkerCaches()).resolves.toBeUndefined();
  });
});

describe('isPrivateServiceWorkerCache', () => {
  it('names only golfhelm caches other than static', () => {
    expect(isPrivateServiceWorkerCache('golfhelm-v1-dynamic')).toBe(true);
    expect(isPrivateServiceWorkerCache('golfhelm-v1-api')).toBe(true);
    expect(isPrivateServiceWorkerCache('golfhelm-v1-static')).toBe(false);
    expect(isPrivateServiceWorkerCache('workbox-precache')).toBe(false);
  });
});
