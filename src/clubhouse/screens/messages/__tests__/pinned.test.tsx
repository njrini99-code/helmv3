import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PIN_LIMIT, readPinned, usePinned, withPin, writePinned } from '../pinned';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pins', () => {
  it('holds at most three, new ones at the end', () => {
    expect(withPin(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    const full = ['a', 'b', 'c'];
    expect(withPin(full, 'd', true)).toBe(full);
    expect(PIN_LIMIT).toBe(3);
  });

  it('survives a reload, per viewer and team', () => {
    writePinned('me', 't1', ['a']);
    expect(readPinned('me', 't1')).toEqual(['a']);
    expect(readPinned('me', 't2')).toEqual([]);
    expect(readPinned('you', 't1')).toEqual([]);
  });

  it('swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readPinned('me', 't1')).toEqual([]);
    expect(() => writePinned('me', 't1', ['a'])).not.toThrow();
  });

  it('drops a pin whose conversation is gone, and toggles', () => {
    writePinned('me', 't1', ['a', 'gone']);
    const { result } = renderHook(() => usePinned('me', 't1', ['a', 'b'], true));
    expect(result.current.ids).toEqual(['a']);
    act(() => result.current.toggle('b'));
    expect(result.current.ids).toEqual(['a', 'b']);
    expect(result.current.has('b')).toBe(true);
  });

  it('reads nothing with the flag off', () => {
    writePinned('me', 't1', ['a']);
    const { result } = renderHook(() => usePinned('me', 't1', ['a'], false));
    expect(result.current.ids).toEqual([]);
  });
});
