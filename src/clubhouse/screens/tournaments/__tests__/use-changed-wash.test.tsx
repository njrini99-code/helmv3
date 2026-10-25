import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChangedWash } from '../use-changed-wash';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useChangedWash', () => {
  it('never washes on first paint', () => {
    const { result } = renderHook(({ v }) => useChangedWash(v), { initialProps: { v: -6 } });
    expect(result.current).toBe(false);
  });

  it('washes for 520 ms after the value changes, then clears', () => {
    const { result, rerender } = renderHook(({ v }) => useChangedWash(v), { initialProps: { v: -6 } });
    rerender({ v: -7 });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(519));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('restarts the hold when the value changes again mid-wash, and ignores a re-render with the same value', () => {
    const { result, rerender } = renderHook(({ v }) => useChangedWash(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => vi.advanceTimersByTime(400));
    rerender({ v: 3 });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(120));
    expect(result.current).toBe(false);
    rerender({ v: 3 });
    expect(result.current).toBe(false);
  });
});
