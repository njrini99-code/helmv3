import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
