// =============================================================================
// useProductsEffects — [data-reveal] and [data-fx] must fail visible.
//
// WHY THIS EXISTS. On production iPhone Safari the CoachHelm deep-scene card
// — "Root cause · Putting" / "3.2 three-putts per round — up from 1.4 in the
// fall." — rendered invisible: its whole `[data-reveal]` wrapper sat at
// `opacity: 0` because the IntersectionObserver that was supposed to lift it
// never fired. iOS Safari's dynamic toolbar resizes the visual viewport
// mid-scroll, and IntersectionObserver has a documented history of not
// re-firing against that resize, so a card can visually pass through the
// viewport and never report `isIntersecting`.
//
// This suite exercises the fallback (see useProductsEffects.ts): a
// `[data-reveal]` element that has scrolled fully past without ever
// intersecting settles on the next scroll tick instead of staying hidden for
// the rest of the session. It also covers the sibling bug in `runFx` — the
// old early-return skipped `[data-fx]` elements (count-ups, `[data-si]`
// stagger rows) that had *already* scrolled past on the very first sampled
// frame, leaving them at their zeroed/hidden state forever.
// =============================================================================

import { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductsEffects } from '../useProductsEffects';

/** Mirrors CoachHelm.tsx's Row A: a `[data-reveal]` card wrapping the
 *  "Root cause · Putting" symptom text, plus a Row C-style stagger list. */
function Harness() {
  const rootRef = useRef<HTMLElement>(null);
  useProductsEffects(rootRef);
  return (
    <section ref={rootRef}>
      <div data-reveal data-reveal-delay="90">
        <span>Root cause · Putting</span>
        <h4 data-ch-symptom>3.2 three-putts per round — up from 1.4 in the fall.</h4>
      </div>
      <div data-fx="stagger">
        <div data-si>M. Alvarez — 3-putts spiking beyond 30 ft</div>
        <div data-si>D. Park — Wedge dispersion widening inside 120 yds</div>
      </div>
    </section>
  );
}

/**
 * jsdom's real (unmocked) `getBoundingClientRect()` returns an all-zero rect,
 * which trivially reads as "at the very top of the viewport" and would fire
 * every reveal at mount regardless of the fix under test. Stub the prototype
 * globally with a default that reads as "below the fold, untouched", so the
 * synchronous mount-time reads (`runFx()` runs once immediately) are
 * controlled too; tests override per element via `setRect`.
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
  vi.restoreAllMocks();
});

describe('[data-reveal] — settles even when IntersectionObserver never fires', () => {
  it('starts hidden (opacity 0) — the normal entrance state', () => {
    const { container } = render(<Harness />);
    const revealEl = container.querySelector('[data-reveal]') as HTMLElement;
    expect(revealEl.style.opacity).toBe('0');
  });

  it('settles visible via the scroll fallback once scrolled fully past, with no IO callback ever firing', () => {
    const { container } = render(<Harness />);
    const revealEl = container.querySelector('[data-reveal]') as HTMLElement;
    // The global IntersectionObserver mock (src/test/setup.tsx) never invokes
    // its callback — this is the exact "IO silently never fires" production
    // condition, not a simulation of it.
    setRect(revealEl, { top: -500, bottom: -50 });

    act(() => window.dispatchEvent(new Event('scroll')));

    expect(revealEl.style.opacity).toBe('1');
    expect(revealEl.style.transform).toBe('none');
  });

  it('stays hidden while genuinely below the fold and not yet scrolled past', () => {
    const { container } = render(<Harness />);
    const revealEl = container.querySelector('[data-reveal]') as HTMLElement;

    act(() => window.dispatchEvent(new Event('scroll'))); // still BELOW_FOLD by default

    expect(revealEl.style.opacity).toBe('0');
  });

  it('prefers-reduced-motion: never hidden, no observer attached', () => {
    setReducedMotion(true);
    const { container } = render(<Harness />);
    const revealEl = container.querySelector('[data-reveal]') as HTMLElement;
    expect(revealEl.style.opacity).not.toBe('0');
  });
});

describe('[data-fx="stagger"] rows — settle even when scrolled past on the first sampled frame', () => {
  it('starts hidden (opacity 0)', () => {
    const { container } = render(<Harness />);
    const row = container.querySelectorAll('[data-si]')[0] as HTMLElement;
    expect(row.style.opacity).toBe('0');
  });

  it('reveals a stagger row whose FIRST sampled scroll frame already has it scrolled past', () => {
    const { container } = render(<Harness />);
    const staggerEl = container.querySelector('[data-fx="stagger"]') as HTMLElement;
    const rows = Array.from(container.querySelectorAll('[data-si]')) as HTMLElement[];

    // Old bug: `r.bottom < 0` was an early-return, so an element that jumped
    // straight from "not yet visible" to "already scrolled past" (a fast
    // fling skipping its whole visible window) was marked neither `done` nor
    // ever revealed again.
    setRect(staggerEl, { top: -900, bottom: -300 });

    act(() => window.dispatchEvent(new Event('scroll')));

    rows.forEach((row) => {
      expect(row.style.opacity).toBe('1');
      expect(row.style.transform).toBe('none');
    });
  });

  it('prefers-reduced-motion: stagger rows render fully visible immediately', () => {
    setReducedMotion(true);
    const { container } = render(<Harness />);
    const rows = Array.from(container.querySelectorAll('[data-si]')) as HTMLElement[];
    rows.forEach((row) => {
      expect(row.style.opacity).toBe('1');
      expect(row.style.transform).toBe('none');
    });
  });
});
