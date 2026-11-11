import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/reduced-motion', () => ({ useChReducedMotion: () => false }));

import { ScoringFeatureChart } from '../ScoringFeatureChart';
import type { TrendRound } from '../round-trend';

/**
 * The scoring feature chart on a desk (found in WebKit, 10 Nov 2026): the card is measured after its first paint, and a desk's card is
 * about twice the first guess. A morph begun at the old width kept writing the old width's average line over the new one, so the
 * line stopped halfway across its own rounds. A new width now stops the morph and draws the line at rest, across every round.
 */
const rounds = (scores: number[], tag: string) => scores.map((value, i) => ({ id: `${tag}${i}`, label: `Oct ${i + 1}`, value, toPar: value - 72, holes: 18 })) as unknown as TrendRound[];
const A = rounds([74, 72, 76, 71, 70, 73, 72, 75], 'a');
const B = rounds([71, 73, 70, 74, 72, 69, 73, 71], 'b');

let width = 320;
let resize: (() => void) | null = null;
let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
const real = { ro: globalThis.ResizeObserver, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  width = 320;
  frames = [];
  let next = 1;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  globalThis.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      resize = () => cb([], this as unknown as ResizeObserver);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push({ id: next, cb });
    return next++;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    frames = frames.filter((f) => f.id !== id);
  }) as typeof cancelAnimationFrame;
});
afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = real.ro;
  globalThis.requestAnimationFrame = real.raf;
  globalThis.cancelAnimationFrame = real.caf;
  if (desc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', desc);
});

/** Every frame asked for, run to the end of the morph. */
const settle = () => {
  for (let guard = 0; frames.length && guard < 50; guard++) {
    const due = frames;
    frames = [];
    act(() => due.forEach((f) => f.cb(performance.now() + 5000)));
  }
};
const lastX = (d: string) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return nums[nums.length - 2]!;
};
const lineEnd = () => lastX(document.querySelector('.ch-shs-avgline')!.getAttribute('d')!);
const lastDot = () => Math.max(...[...document.querySelectorAll('.ch-shs-rdot')].map((c) => Number(c.getAttribute('cx'))));

describe('the scoring feature chart keeps its average line across every round when its card is measured', () => {
  it('a width that lands during a morph stops the morph: the line ends on the last round, not at the old width', () => {
    const view = render(<ScoringFeatureChart rounds={A} tone="gain" onRead={() => {}} />);
    expect(lineEnd()).toBeCloseTo(lastDot(), 0);
    // New rounds: a morph begins at the first width.
    view.rerender(<ScoringFeatureChart rounds={B} tone="gain" onRead={() => {}} />);
    expect(frames.length).toBeGreaterThan(0);
    // The card is measured: a desk's width, more than twice the guess.
    width = 700;
    act(() => resize!());
    settle();
    expect(lastDot()).toBeGreaterThan(500);
    expect(lineEnd()).toBeCloseTo(lastDot(), 0);
  });

  it('new rounds at a settled width still morph, and end on the new shape', () => {
    const view = render(<ScoringFeatureChart rounds={A} tone="gain" onRead={() => {}} />);
    view.rerender(<ScoringFeatureChart rounds={B} tone="gain" onRead={() => {}} />);
    expect(frames.length).toBeGreaterThan(0);
    settle();
    expect(lineEnd()).toBeCloseTo(lastDot(), 0);
  });
});
