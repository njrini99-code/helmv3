import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_BUSY } from '../motion';
import { useBusy, useBusyReveal, type ChBusyPhase } from '../use-busy';

/**
 * Loading (MOTION-AND-VISUAL 3.9): nothing new for 150 ms, then a static skeleton held at least 300 ms once shown, then the
 * content crossfades in over 180 ms, opacity only. Every case rerenders the hook (a single render cannot see a timer that
 * outlives its effect).
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-motion');
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function busy(initial: boolean) {
  return renderHook(({ pending }: { pending: boolean }) => useBusy(pending), { initialProps: { pending: initial } });
}

describe('useBusy', () => {
  it('the timers are the vocabulary\'s', () => {
    expect(CH_BUSY).toEqual({ delay: 150, min: 300 });
  });

  it('a page with its data is ready at once', () => {
    expect(busy(false).result.current).toBe('ready');
  });

  it('a request that resolves at 100 ms never shows a skeleton', () => {
    const h = busy(false);
    h.rerender({ pending: true });
    expect(h.result.current).toBe('idle');
    advance(100);
    expect(h.result.current).toBe('idle');
    h.rerender({ pending: false });
    expect(h.result.current).toBe('ready');
    // The skeleton's timer died with the request: nothing shows later either.
    advance(1000);
    expect(h.result.current).toBe('ready');
  });

  it('a request that resolves at 200 ms shows the skeleton from 150 ms and holds it until 450 ms', () => {
    const h = busy(true);
    const seen: Array<[number, ChBusyPhase]> = [];
    const at = (t: number) => seen.push([t, h.result.current]);
    at(0);
    advance(149);
    at(149);
    advance(1);
    at(150);
    advance(50);
    h.rerender({ pending: false });
    at(200);
    advance(249);
    at(449);
    advance(1);
    at(450);
    expect(seen).toEqual([
      [0, 'idle'],
      [149, 'idle'],
      [150, 'skeleton'],
      [200, 'skeleton'],
      [449, 'skeleton'],
      [450, 'ready'],
    ]);
  });

  it('a request that resolves after the hold is ready at once', () => {
    const h = busy(true);
    advance(CH_BUSY.delay + CH_BUSY.min + 50);
    expect(h.result.current).toBe('skeleton');
    h.rerender({ pending: false });
    expect(h.result.current).toBe('ready');
  });

  it('a request that starts again while the skeleton holds keeps it up, with no second wait, and the hold counts from the first show', () => {
    const h = busy(true);
    advance(150);
    expect(h.result.current).toBe('skeleton');
    advance(50);
    h.rerender({ pending: false });
    advance(50);
    // 250 ms: the first request has landed, the skeleton holds; a second request starts.
    h.rerender({ pending: true });
    expect(h.result.current).toBe('skeleton');
    advance(300);
    expect(h.result.current).toBe('skeleton');
    // The second lands at 550 ms, past the hold (150 + 300): the content shows at once.
    h.rerender({ pending: false });
    expect(h.result.current).toBe('ready');
  });

  it('a second request after the content showed waits the 150 ms again, keeping what was there', () => {
    const h = busy(true);
    advance(400);
    h.rerender({ pending: false });
    advance(100);
    expect(h.result.current).toBe('ready');
    h.rerender({ pending: true });
    expect(h.result.current).toBe('idle');
    advance(149);
    expect(h.result.current).toBe('idle');
    advance(1);
    expect(h.result.current).toBe('skeleton');
  });

  it('unmounting clears its timers', () => {
    const clear = vi.spyOn(window, 'clearTimeout');
    const h = busy(true);
    expect(vi.getTimerCount()).toBe(1);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(clear).toHaveBeenCalled();
    const held = busy(true);
    advance(150);
    held.rerender({ pending: false });
    expect(vi.getTimerCount()).toBe(1);
    held.unmount();
    expect(vi.getTimerCount()).toBe(0);
    clear.mockRestore();
  });
});

describe('useBusyReveal', () => {
  const animate = vi.fn((..._args: unknown[]) => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }) as unknown as Animation);
  const original = Element.prototype.animate;
  beforeEach(() => {
    animate.mockClear();
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  });
  afterEach(() => {
    Element.prototype.animate = original;
  });

  function Harness({ pending }: { pending: boolean }) {
    const phase = useBusy(pending);
    const reveal = useBusyReveal<HTMLDivElement>(phase);
    return phase === 'skeleton' ? <span className="ch-skel" /> : <div ref={reveal} data-phase={phase} />;
  }

  it('content that takes a shown skeleton\'s place fades in over the quick beat, opacity only', () => {
    const view = render(<Harness pending />);
    advance(150);
    expect(view.container.querySelector('.ch-skel')).not.toBeNull();
    view.rerender(<Harness pending={false} />);
    advance(300);
    expect(view.container.querySelector('[data-phase="ready"]')).not.toBeNull();
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, timing] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(timing.duration).toBe(180);
  });

  it('content that lands before the skeleton showed is simply there', () => {
    const view = render(<Harness pending />);
    advance(100);
    view.rerender(<Harness pending={false} />);
    expect(view.container.querySelector('[data-phase="ready"]')).not.toBeNull();
    expect(animate).not.toHaveBeenCalled();
  });

  it('Animations off swaps at once', () => {
    document.documentElement.setAttribute('data-motion', 'off');
    const view = render(<Harness pending />);
    advance(150);
    view.rerender(<Harness pending={false} />);
    advance(300);
    expect(animate).not.toHaveBeenCalled();
  });
});
