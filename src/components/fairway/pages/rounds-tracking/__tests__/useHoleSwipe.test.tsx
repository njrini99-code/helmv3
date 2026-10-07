/**
 * D-HOLESWIPE (owner decision 2026-09-23) / RE-D1 / MOT-20: swipe between
 * holes, with the 20pt edge strip left to the OS back gesture.
 */
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decideHoleSwipe,
  HOLE_SWIPE_COMMIT_PX,
  HOLE_SWIPE_EDGE_GUARD_PX,
  isInEdgeGuard,
  useHoleSwipe,
  type HoleSwipeOptions,
} from '../useHoleSwipe';

// jsdom has no PointerEvent; a MouseEvent carrying the pointer fields is
// enough for the hook's native listeners.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'touch';
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
  }
});

function Harness(props: HoleSwipeOptions) {
  const ref = useHoleSwipe<HTMLDivElement>(props);
  return (
    <div ref={ref} data-testid="surface">
      <input aria-label="distance" />
      <span>content</span>
    </div>
  );
}

function swipe(el: Element, fromX: number, toX: number, opts: { y?: number; type?: string; toY?: number } = {}) {
  const y = opts.y ?? 300;
  const pointerType = opts.type ?? 'touch';
  const base = { bubbles: true, pointerId: 7, pointerType, isPrimary: true } as PointerEventInit;
  el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: fromX, clientY: y }));
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    const yy = y + (((opts.toY ?? y) - y) * i) / steps;
    el.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x, clientY: yy }));
  }
  el.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: toX, clientY: opts.toY ?? y }));
}

function setup(overrides: Partial<HoleSwipeOptions> = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const utils = render(<Harness canPrev canNext onPrev={onPrev} onNext={onNext} {...overrides} />);
  return { onPrev, onNext, surface: utils.getByTestId('surface'), input: utils.getByLabelText('distance') };
}

describe('decideHoleSwipe', () => {
  it('commits past the travel threshold, in the direction of travel', () => {
    expect(decideHoleSwipe(-HOLE_SWIPE_COMMIT_PX, 1000, true, true)).toBe('next');
    expect(decideHoleSwipe(HOLE_SWIPE_COMMIT_PX, 1000, true, true)).toBe('prev');
  });

  it('commits a short fast flick, but not a short slow drag', () => {
    expect(decideHoleSwipe(-40, 60, true, true)).toBe('next');
    expect(decideHoleSwipe(-40, 800, true, true)).toBeNull();
  });

  it('never moves where there is no hole to go to', () => {
    expect(decideHoleSwipe(-200, 100, true, false)).toBeNull();
    expect(decideHoleSwipe(200, 100, false, true)).toBeNull();
  });
});

describe('isInEdgeGuard', () => {
  it('reserves 20pt at each screen edge', () => {
    expect(HOLE_SWIPE_EDGE_GUARD_PX).toBe(20);
    expect(isInEdgeGuard(5, 390)).toBe(true);
    expect(isInEdgeGuard(19, 390)).toBe(true);
    expect(isInEdgeGuard(20, 390)).toBe(false);
    expect(isInEdgeGuard(380, 390)).toBe(true);
    expect(isInEdgeGuard(200, 390)).toBe(false);
  });
});

describe('useHoleSwipe', () => {
  it('swipes left to the next hole and right to the previous one', () => {
    const { surface, onNext, onPrev } = setup();
    swipe(surface, 300, 150);
    expect(onNext).toHaveBeenCalledTimes(1);
    swipe(surface, 100, 260);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('leaves a gesture that starts in the edge strip to the OS', () => {
    const { surface, onPrev } = setup();
    swipe(surface, 8, 200);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('ignores a vertical scroll that drifts sideways', () => {
    const { surface, onNext } = setup();
    swipe(surface, 300, 240, { toY: 520 });
    expect(onNext).not.toHaveBeenCalled();
  });

  it('ignores mouse drags and gestures that start on a text field', () => {
    const { surface, input, onNext } = setup();
    swipe(surface, 300, 100, { type: 'mouse' });
    swipe(input, 300, 100);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const { surface, onNext } = setup({ enabled: false });
    swipe(surface, 300, 100);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('swallows the click the lifted finger would deliver after a swipe', () => {
    const { surface } = setup();
    const onClick = vi.fn();
    surface.addEventListener('click', onClick);
    swipe(surface, 300, 100);
    surface.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
