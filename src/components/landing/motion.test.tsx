// =============================================================================
// motion.tsx — Reveal / useSequence must fail visible, not fail hidden.
//
// WHY THIS EXISTS. Production iPhone Safari screenshots showed AboutView's
// "The Problem" heading and CoachHelm's evidence card both stuck at their
// scroll-reveal HIDDEN state — clip-path/opacity that a scroll trigger was
// supposed to lift, but never did. `Reveal`/`useSequence` decide when to
// reveal by sampling `visibleFraction()` on discrete `scroll` events; iOS
// Safari can coalesce those events so sparsely during a fast fling that the
// one frame where an element crosses the reveal threshold is never sampled —
// the element goes straight from "below the fold" to "scrolled past" with no
// callback firing in between, and stays clipped to zero height forever.
//
// The fix (see motion.tsx) adds a fallback: if an element's bottom has
// already scrolled above the viewport without ever revealing, settle it on
// the next scroll tick regardless of whether the threshold crossing was ever
// sampled. Scroll animation may add polish; it must never gate legibility.
// =============================================================================

import { createRef, type RefObject } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reveal, useSequence } from './motion';

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function flushAnimationFrame() {
  act(() => {
    const queued = [...rafCallbacks.values()];
    rafCallbacks.clear();
    queued.forEach((callback) => callback(0));
  });
}

/**
 * jsdom's real (unmocked) `getBoundingClientRect()` returns an all-zero rect
 * — which trivially satisfies a naive `bottom <= 0` "scrolled past" check
 * before a test ever gets to mock anything. Stub the prototype globally, with
 * a default that reads as "below the fold, untouched", so mount-time reads
 * are controlled too; tests override per element via `setRect`.
 */
let rects: WeakMap<Element, Partial<DOMRect>>;
const BELOW_FOLD: Partial<DOMRect> = { top: 900, bottom: 1000, height: 100 };

function setRect(el: Element, rect: Partial<DOMRect>) {
  rects.set(el, rect);
}

function setReducedMotion(matches: boolean) {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList);
}

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => rafCallbacks.delete(id)),
  );
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  setReducedMotion(false);

  rects = new WeakMap();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...BELOW_FOLD,
      ...rects.get(this),
    } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Reveal — fail-visible when the scroll trigger never fires', () => {
  it('starts clipped (the normal hidden entrance state)', () => {
    const { container } = render(<Reveal>Good coaches aren&apos;t buried in spreadsheets.</Reveal>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.clipPath).toBe('inset(0 0 100% 0)');
  });

  it('settles visible once scrolled fully past, even though it never crossed the reveal threshold', () => {
    const { container } = render(<Reveal>Good coaches aren&apos;t buried in spreadsheets.</Reveal>);
    const el = container.firstElementChild as HTMLElement;

    // The fast-fling gap: the only scroll frame sampled lands with the
    // element already scrolled fully above the fold — visibleFraction was
    // never in [threshold, 1) on any sampled frame.
    setRect(el, { top: -600, bottom: -100 });
    act(() => window.dispatchEvent(new Event('scroll')));
    flushAnimationFrame(); // 1: runFrame samples the scroll frame, schedules the settle
    flushAnimationFrame(); // 2: outer rAF of Reveal's double-rAF settle
    flushAnimationFrame(); // 3: inner rAF actually writes the settled style

    expect(el.style.clipPath).toBe('inset(0 0 0 0)');
    expect(el.style.transform).toBe('none');
  });

  it('does not reveal while genuinely below the fold and not yet scrolled past', () => {
    const { container } = render(<Reveal>Good coaches aren&apos;t buried in spreadsheets.</Reveal>);
    const el = container.firstElementChild as HTMLElement;

    act(() => window.dispatchEvent(new Event('scroll'))); // still BELOW_FOLD by default
    flushAnimationFrame();
    flushAnimationFrame();

    expect(el.style.clipPath).toBe('inset(0 0 100% 0)');
  });

  it('prefers-reduced-motion: renders fully visible immediately, never clipped', () => {
    setReducedMotion(true);
    const { container } = render(<Reveal>Good coaches aren&apos;t buried in spreadsheets.</Reveal>);
    const el = container.firstElementChild as HTMLElement;

    expect(el.style.clipPath).toBe('');
    expect(el.getAttribute('data-anim-ready')).toBe('');
  });
});

describe('useSequence — same fail-visible fallback for [data-anim]/[data-rise] children', () => {
  function Harness({ innerRef }: { innerRef: RefObject<HTMLDivElement | null> }) {
    useSequence(innerRef);
    return (
      <div ref={innerRef}>
        <h3 data-anim>3.2 three-putts per round.</h3>
      </div>
    );
  }

  it('fires the sequence once the container has scrolled fully past, without ever crossing the 25% threshold', async () => {
    const ref = createRef<HTMLDivElement>();
    render(<Harness innerRef={ref} />);
    const container = ref.current as HTMLDivElement;
    const heading = container.querySelector('[data-anim]') as HTMLElement;

    // Prepared hidden state from mount.
    expect(heading.style.clipPath).toBe('inset(0 0 100% 0)');

    setRect(container, { top: -900, bottom: -200 });
    act(() => window.dispatchEvent(new Event('scroll')));
    flushAnimationFrame(); // runFrame samples the scroll frame and fires runSequence()

    // runSequence schedules the staged reveal on a real window.setTimeout —
    // vi.waitFor polls with real timers, so it resolves once that fires.
    await vi.waitFor(() => {
      expect(heading.style.clipPath).toBe('inset(0 0 0 0)');
    });
  });

  it('prefers-reduced-motion: never prepares a hidden state', () => {
    setReducedMotion(true);
    const ref = createRef<HTMLDivElement>();
    render(<Harness innerRef={ref} />);
    const heading = ref.current!.querySelector('[data-anim]') as HTMLElement;
    expect(heading.style.clipPath).toBe('');
  });
});
