// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => false }));

import { useSkeletonSwap } from '../use-skeleton-swap';

describe('useSkeletonSwap (MOT-17)', () => {
  it('hard-swaps a fast load', () => {
    let t = 0;
    const clock = () => t;
    const { result, rerender } = renderHook(({ loading }) => useSkeletonSwap(loading, clock), {
      initialProps: { loading: true },
    });
    t = 120;
    rerender({ loading: false });
    expect(result.current.fade).toBe(false);
    expect(result.current.className).toBe('');
  });

  it('fades in after a slow load', () => {
    let t = 0;
    const clock = () => t;
    const { result, rerender } = renderHook(({ loading }) => useSkeletonSwap(loading, clock), {
      initialProps: { loading: true },
    });
    t = 900;
    rerender({ loading: false });
    expect(result.current.fade).toBe(true);
    expect(result.current.className).toContain('150ms');
  });

  it('never fades content that was never loading', () => {
    const { result } = renderHook(() => useSkeletonSwap(false));
    expect(result.current.fade).toBe(false);
  });
});
