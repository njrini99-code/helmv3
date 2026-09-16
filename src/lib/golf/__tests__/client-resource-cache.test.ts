import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetCachedResourcesForTests,
  clearAllCachedResources,
  clearCachedResource,
  readCachedResource,
  writeCachedResource,
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
});
