import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chLenisIdleLoop } from '../smooth-scroll';

/**
 * B8: Lenis's frame loop runs only while something moves. After a scroll ends, frames stop being asked for; a wheel, a
 * scroll or a programmatic glide wakes it again.
 */
function fakeLenis() {
  const handlers: Record<string, Array<() => void>> = {};
  const lenis = {
    isScrolling: false as false | 'smooth' | 'native',
    raf: vi.fn(),
    scrollTo: vi.fn(),
    on: vi.fn((name: string, fn: () => void) => {
      (handlers[name] ??= []).push(fn);
      return () => {
        handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn);
      };
    }),
    emit: (name: string) => (handlers[name] ?? []).forEach((h) => h()),
  };
  return lenis;
}

let frames: Array<FrameRequestCallback> = [];
const step = (n = 1) => {
  for (let i = 0; i < n; i += 1) {
    const due = frames;
    frames = [];
    due.forEach((f) => f(performance.now()));
  }
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    frames.push(f);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the Lenis loop sleeps (B8)', () => {
  it('stops asking for frames two frames after a scroll ends', () => {
    const lenis = fakeLenis();
    const loop = chLenisIdleLoop(lenis as never);
    lenis.isScrolling = 'smooth';
    step(5);
    expect(frames).toHaveLength(1);
    lenis.isScrolling = false;
    step(2);
    expect(frames).toHaveLength(0);
    expect(loop.running()).toBe(false);
    step(10);
    expect(lenis.raf).toHaveBeenCalledTimes(7);
  });

  it('a wheel (virtual-scroll), a scroll or a scrollTo wakes it', () => {
    const lenis = fakeLenis();
    const loop = chLenisIdleLoop(lenis as never);
    step(3);
    expect(loop.running()).toBe(false);
    lenis.emit('virtual-scroll');
    expect(loop.running()).toBe(true);
    step(3);
    lenis.emit('scroll');
    expect(loop.running()).toBe(true);
    step(3);
    (lenis as unknown as { scrollTo: (n: number) => void }).scrollTo(400);
    expect(loop.running()).toBe(true);
  });

  it('stop lets go of its frame and its listeners', () => {
    const lenis = fakeLenis();
    const loop = chLenisIdleLoop(lenis as never);
    loop.stop();
    expect(frames).toHaveLength(0);
    lenis.emit('scroll');
    expect(loop.running()).toBe(false);
  });
});
