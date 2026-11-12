// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDictation } from '../useDictation';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the composer’s mic', () => {
  it('without a speech API it isn’t offered, and pressing does nothing', () => {
    const { result } = renderHook(() => useDictation(vi.fn()));
    expect(result.current.available).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.on).toBe(false);
  });

  it('with one, the words land and it turns itself off when the speaker stops', () => {
    const made: Array<{ start: () => void; stop: () => void; onresult: ((e: unknown) => void) | null; onend: (() => void) | null }> = [];
    class Fake {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult = null;
      onend = null;
      onerror = null;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        made.push(this as never);
      }
    }
    vi.stubGlobal('webkitSpeechRecognition', Fake);
    const words = vi.fn();
    const { result } = renderHook(() => useDictation(words));
    expect(result.current.available).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.on).toBe(true);
    expect(made[0]!.start).toHaveBeenCalled();
    act(() => {
      made[0]!.onresult!({ results: [[{ transcript: 'add a practice' }]] });
      made[0]!.onend!();
    });
    expect(words).toHaveBeenCalledWith('add a practice');
    expect(result.current.on).toBe(false);
  });
});
