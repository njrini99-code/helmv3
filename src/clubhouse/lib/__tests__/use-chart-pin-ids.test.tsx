import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { useChartPin } from '../use-chart-pin';

const key = (k: string) => ({ key: k, preventDefault() {}, stopPropagation() {} }) as unknown as KeyboardEvent<HTMLElement>;

describe('useChartPin · a pin follows its datum, not its index (research report, chart concurrency)', () => {
  it('a round that arrives before the pinned one leaves the pin on the same round', () => {
    const { result, rerender } = renderHook(({ ids }) => useChartPin(ids.length, 'x', [0, 1], undefined, { ids }), { initialProps: { ids: ['a', 'b', 'c'] } });
    act(() => result.current.container.onKeyDown(key('End')));
    expect(result.current.pinned).toBe(2);
    rerender({ ids: ['z', 'a', 'b', 'c'] });
    expect(result.current.pinned).toBe(3);
  });

  it('a pinned round that leaves drops the pin instead of moving it to a neighbour', () => {
    const { result, rerender } = renderHook(({ ids }) => useChartPin(ids.length, 'x', [0, 1], undefined, { ids }), { initialProps: { ids: ['a', 'b', 'c'] } });
    act(() => result.current.container.onKeyDown(key('Home')));
    expect(result.current.pinned).toBe(0);
    rerender({ ids: ['b', 'c', 'd'] });
    expect(result.current.pinned).toBeNull();
  });

  it('without ids the pin keeps its position, as before', () => {
    const { result, rerender } = renderHook(({ n }) => useChartPin(n, 'x'), { initialProps: { n: 3 } });
    act(() => result.current.container.onKeyDown(key('End')));
    rerender({ n: 4 });
    expect(result.current.pinned).toBe(2);
  });
});
