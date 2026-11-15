import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_DUR_MS, CH_EASE_IOS_CSS } from '../../../lib/motion';
import { useThreadMakeRoom } from '../thread-v2';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
});
const animate = vi.fn(() => ({ cancel: vi.fn() }));
let height = 0;
beforeEach(() => {
  animate.mockClear();
  height = 200;
  HTMLElement.prototype.animate = animate as never;
  HTMLElement.prototype.getAnimations = (() => []) as never;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  vi.stubGlobal('DOMMatrixReadOnly', class { m42 = 0; });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

function Thread({ count }: { count: number }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  useThreadMakeRoom(scroller, count, true, false);
  return (
    <div ref={scroller}>
      <div className="ch-ms-msgs" />
    </div>
  );
}

/** Measured on staging, 2026-11-07: an additive make-room ran on every thread open and held the main thread drawing for about a second. */
describe('the thread making room', () => {
  it('opens at rest: the first messages landing move nothing', () => {
    const { rerender } = render(<Thread count={0} />);
    rerender(<Thread count={0} />);
    height = 800;
    rerender(<Thread count={12} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('a new message moves the list by transform, as one replacing animation the compositor can run', () => {
    const { rerender } = render(<Thread count={12} />);
    rerender(<Thread count={12} />);
    height = 260;
    rerender(<Thread count={13} />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames[0]!.transform).toBe('translateY(60px)');
    expect(options.composite).toBeUndefined();
  });

  it('moves on an insert FLIP whatever the cause: the base beat on the iOS curve (MOTION-AND-VISUAL 3.5)', () => {
    const { rerender } = render(<Thread count={12} />);
    rerender(<Thread count={12} />);
    height = 260;
    rerender(<Thread count={13} />);
    height = 200;
    rerender(<Thread count={12} />);
    const timings = animate.mock.calls.map((c) => (c as unknown as [Keyframe[], KeyframeAnimationOptions])[1]);
    expect(timings).toHaveLength(2);
    for (const t of timings) expect(t).toMatchObject({ duration: CH_DUR_MS.base, easing: CH_EASE_IOS_CSS });
  });

  it('a new message holds its place while the rows above make room: its own 8 px rise is its arrival (3.5)', () => {
    function Rows({ count }: { count: number }) {
      const scroller = useRef<HTMLDivElement | null>(null);
      useThreadMakeRoom(scroller, count, true, false);
      return (
        <div ref={scroller}>
          <div className="ch-ms-msgs">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} id={`ch-ms-message-m${i}`} className="ch-ms-msg">
                <span className="ch-ms-msg__av" data-testid={`av${i}`} />
                <div className="ch-ms-msg__col" data-testid={`col${i}`} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    const { rerender, getByTestId } = render(<Rows count={2} />);
    rerender(<Rows count={2} />);
    height = 260;
    rerender(<Rows count={3} />);
    const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
    const targets = animate.mock.contexts as HTMLElement[];
    // The list moves up 60; the new row's avatar and column move down 60 on the same clock, so together they hold still.
    expect(calls[0]![0][0]!.transform).toBe('translateY(60px)');
    expect(targets.slice(1)).toEqual([getByTestId('av2'), getByTestId('col2')]);
    for (const [frames, t] of calls.slice(1)) {
      expect(frames[0]!.transform).toBe('translateY(-60px)');
      expect(t).toEqual(calls[0]![1]);
    }
  });
});
