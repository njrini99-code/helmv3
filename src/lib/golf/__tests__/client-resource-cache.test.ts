import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCachedResourcesForTests,
  clearAllCachedResources,
  clearCachedResource,
  getCacheEpoch,
  readCachedResource,
  writeCachedResource,
  writeCachedResourceIfCurrent,
} from '../client-resource-cache';

beforeEach(() => {
  __resetCachedResourcesForTests();
  clearAllCachedResources();
});

describe('client-resource-cache', () => {
  it('returns null for an unknown key', () => {
    expect(readCachedResource('nope')).toBeNull();
  });

  it('round-trips a value with its age', () => {
    writeCachedResource('k', { rows: [1, 2] });
    const hit = readCachedResource<{ rows: number[] }>('k');
    expect(hit?.data.rows).toEqual([1, 2]);
    expect(hit?.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('survives a memory reset when sessionStorage is available (reload / cold start)', () => {
    if (typeof window === 'undefined') return;
    writeCachedResource('k', 'warm');
    __resetCachedResourcesForTests();
    expect(readCachedResource<string>('k')?.data).toBe('warm');
  });

  it('clearAll leaves nothing behind for the next signed-in user', () => {
    writeCachedResource('golf.conversations:a', [1]);
    writeCachedResource('golf.messages:c', [2]);
    clearAllCachedResources();
    expect(readCachedResource('golf.conversations:a')).toBeNull();
    expect(readCachedResource('golf.messages:c')).toBeNull();
  });

  it('clears a single key', () => {
    writeCachedResource('k', 1);
    clearCachedResource('k');
    expect(readCachedResource('k')).toBeNull();
  });

  describe('epoch guard — a fetch in flight when sign-out clears the cache', () => {
    it('drops a write captured BEFORE a clearAll that happened while the fetch was in flight', () => {
      const asOfEpoch = getCacheEpoch();
      clearAllCachedResources(); // e.g. sign-out, mid-fetch
      writeCachedResourceIfCurrent('golf.conversations:a', ['stale, belongs to the signed-out user'], asOfEpoch);
      expect(readCachedResource('golf.conversations:a')).toBeNull();
    });

    it('writes normally when nothing cleared the cache since the epoch was captured', () => {
      const asOfEpoch = getCacheEpoch();
      writeCachedResourceIfCurrent('k', 'fresh', asOfEpoch);
      expect(readCachedResource<string>('k')?.data).toBe('fresh');
    });

    it('bumps the epoch on every clearAll, so a write racing a LATER clear still drops', () => {
      const asOfEpoch = getCacheEpoch();
      clearAllCachedResources();
      clearAllCachedResources();
      writeCachedResourceIfCurrent('k', 'stale', asOfEpoch);
      expect(readCachedResource('k')).toBeNull();
    });
  });
});
