// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LIVE_OPT_IN_PREFIX, readLiveOptIn, useLiveOptIn, writeLiveOptIn, type OptInStorage } from '../live-opt-in';

function memoryStorage(): OptInStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe('Meridian Live opt-in (owner ask, 2026-09-17)', () => {
  it('is null until the player chooses, keyed by round, and survives a reload on the device', () => {
    const storage = memoryStorage();
    expect(readLiveOptIn('r1', storage)).toBeNull();
    writeLiveOptIn('r1', 'on', storage);
    expect(readLiveOptIn('r1', storage)).toBe('on');
    expect(readLiveOptIn('r2', storage)).toBeNull();
    expect(storage.map.get(LIVE_OPT_IN_PREFIX + 'r1')).toBe('on');
    storage.map.set(LIVE_OPT_IN_PREFIX + 'r2', 'garbage');
    expect(readLiveOptIn('r2', storage)).toBeNull();
    expect(readLiveOptIn(null, storage)).toBeNull();
    expect(readLiveOptIn('r1', null)).toBeNull();
    const throwing: OptInStorage = { getItem() { throw new Error('private mode'); }, setItem() { throw new Error('private mode'); } };
    expect(readLiveOptIn('r1', throwing)).toBeNull();
    expect(() => writeLiveOptIn('r1', 'on', throwing)).not.toThrow();
  });
  it('as state: the setter writes the round record, and a round id arriving later brings its own', () => {
    const storage = memoryStorage();
    writeLiveOptIn('saved', 'on', storage);
    const hook = renderHook(({ roundId }: { roundId: string | null }) => useLiveOptIn(roundId, storage), { initialProps: { roundId: null as string | null } });
    expect(hook.result.current[0]).toBeNull();
    act(() => { hook.result.current[1]('on'); });
    expect(hook.result.current[0]).toBe('on');
    expect(storage.map.size).toBe(1); // no round yet: the choice lasts the page only
    hook.rerender({ roundId: 'saved' });
    expect(hook.result.current[0]).toBe('on');
    act(() => { hook.result.current[1]('off'); });
    expect(hook.result.current[0]).toBe('off');
    expect(readLiveOptIn('saved', storage)).toBe('off');
    hook.rerender({ roundId: 'fresh' });
    expect(hook.result.current[0]).toBeNull();
  });
});
