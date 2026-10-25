// @vitest-environment jsdom
import Lenis from 'lenis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH_SCROLL_DUR } from '../motion';
import { chLenisIdleLoop } from '../smooth-scroll';

/**
 * B8 against Lenis's own clock (auditor on #2361, the idle-loop blocker). The loop sleeps between gestures, and Lenis
 * steps a glide by the time since the last frame it saw. Woken after a pause, that is the whole pause: longer than the
 * glide, so the glide finished in one frame and the page jumped. The first frame after a wake steps one frame, as it
 * would have had the loop never slept. A real Lenis here, driven by a frame clock, so its own arithmetic runs.
 */
const FRAME = 1000 / 60;
const EASE = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t));
/** Where a glide of `distance` is after one frame of an always-running loop. */
const afterOneFrame = (distance: number) => distance * EASE(FRAME / 1000 / CH_SCROLL_DUR);

let frames: FrameRequestCallback[] = [];
let now = 0;
/** Runs `n` frames, the clock moving one frame (`ms`) before each. */
const tick = (n = 1, ms = FRAME) => {
  for (let i = 0; i < n; i += 1) {
    now += ms;
    const due = frames;
    frames = [];
    due.forEach((f) => f(now));
  }
};

/** A canvas with 4,200px to scroll (jsdom lays nothing out, so the sizes are set by hand). */
function canvas(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperties(el, {
    scrollHeight: { value: 5000 },
    clientHeight: { value: 800 },
    scrollWidth: { value: 600 },
    clientWidth: { value: 600 },
  });
  el.scrollTo = vi.fn((to?: ScrollToOptions | number) => {
    if (typeof to === 'object' && to.top != null) el.scrollTop = to.top;
  }) as typeof el.scrollTo;
  document.body.appendChild(el);
  return el;
}

function smooth() {
  const wrapper = canvas();
  const lenis = new Lenis({ wrapper, content: wrapper, duration: CH_SCROLL_DUR, easing: EASE, smoothWheel: true, syncTouch: false });
  return { wrapper, lenis, loop: chLenisIdleLoop(lenis) };
}

beforeEach(() => {
  frames = [];
  now = 10_000;
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    frames.push(f);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('a glide after the loop has slept (B8, Lenis clock)', () => {
  it('a scroll call after a pause glides from its first frame instead of landing in one', () => {
    const { lenis, loop } = smooth();
    tick(3);
    expect(loop.running()).toBe(false);

    now += 3000; // three seconds with no frames at all
    lenis.scrollTo(400);
    tick();
    expect(lenis.isScrolling).toBe('smooth');
    expect(lenis.animatedScroll).toBeCloseTo(afterOneFrame(400), 3);

    tick(Math.ceil(CH_SCROLL_DUR * 60) + 1);
    expect(lenis.animatedScroll).toBe(400);
    expect(lenis.isScrolling).toBe(false);
  });

  it('the first wheel notch after a pause glides too', () => {
    const { wrapper, lenis, loop } = smooth();
    tick(3);
    expect(loop.running()).toBe(false);

    now += 3000;
    wrapper.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    expect(loop.running()).toBe(true);
    tick();
    expect(lenis.isScrolling).toBe('smooth');
    expect(lenis.animatedScroll).toBeCloseTo(afterOneFrame(120), 3);
  });

  it('a second glide after a second pause starts the same way', () => {
    const { lenis, loop } = smooth();
    lenis.scrollTo(400);
    tick(Math.ceil(CH_SCROLL_DUR * 60) + 4);
    expect(lenis.animatedScroll).toBe(400);
    expect(loop.running()).toBe(false);

    now += 1500;
    lenis.scrollTo(800);
    tick();
    expect(lenis.animatedScroll).toBeCloseTo(400 + afterOneFrame(400), 3);
  });

  it('on a faster display the first frame steps that display’s frame, as the loop measured it', () => {
    const { lenis, loop } = smooth();
    const fast = 1000 / 120;
    lenis.scrollTo(400);
    tick(Math.ceil(CH_SCROLL_DUR * 120) + 4, fast);
    expect(loop.running()).toBe(false);

    now += 2000;
    lenis.scrollTo(800);
    tick(1, fast);
    expect(lenis.animatedScroll).toBeCloseTo(400 + 400 * EASE(fast / 1000 / CH_SCROLL_DUR), 3);
  });
});
