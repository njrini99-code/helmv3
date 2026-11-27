import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/reduced-motion', () => ({ useChReducedMotion: () => true }));

import { ScoringFeatureChart, TeamFeatureChart } from '../ScoringFeatureChart';
import type { TrendRound } from '../round-trend';

/**
 * My stats' scoring hero (stats and charts audit 2026-11-15): par sits inside the range on both sides, so a player under par in every
 * round still sees the line (CH-16); rounds sit by the day they were played (CH-11); the five-round average is straight segments,
 * never a curve between rounds (CH-15).
 */
const H = 160;
const day = (d: number) => Date.UTC(2026, 9, d);
const rounds = (scores: number[], days?: number[]): TrendRound[] =>
  scores.map((value, i) => ({ id: `r${i}`, label: `Oct ${days?.[i] ?? i + 1}`, value, toPar: value - 72, holes: 18, ...(days ? { at: day(days[i]!) } : {}) }));

const real = globalThis.ResizeObserver;
beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = real;
});

const draw = (r: TrendRound[]) => render(<ScoringFeatureChart rounds={r} tone="flat" onRead={() => {}} />).container;

describe('scoring hero · par stays on the plot (CH-16)', () => {
  it('rounds of −2, −1 and −3 on a par 72 draw the par line inside the chart, below every round', () => {
    const c = draw(rounds([70, 71, 69]));
    const par = c.querySelector('.ch-shs-parline')!;
    const y = Number(par.getAttribute('y1'));
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(H);
    // Lower is better and sits higher: every under-par round is above the par line.
    for (const dot of c.querySelectorAll('.ch-shs-rdot')) expect(Number(dot.getAttribute('cy'))).toBeLessThan(y);
  });
});

describe('scoring hero · rounds sit by their dates (CH-11)', () => {
  it('rounds on Oct 1, Oct 2 and Oct 30 draw the month off over three times as wide as the day between the first two', () => {
    // The shared line chart's floor holds two rounds at least half an even gap apart, so a day never collapses to one spot; past it,
    // the gaps follow the calendar (even spacing drew these two gaps the same).
    const c = draw(rounds([72, 74, 73], [1, 2, 30]));
    const xs = [...c.querySelectorAll('.ch-shs-rdot')].map((d) => Number(d.getAttribute('cx')));
    expect(xs).toHaveLength(3);
    expect(xs[2]! - xs[1]!).toBeGreaterThan(3 * (xs[1]! - xs[0]!));
  });

  it('with enough rounds that the floor no longer binds, the gaps follow the calendar', () => {
    const days = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 30];
    const c = draw(rounds(days.map(() => 72), days));
    const xs = [...c.querySelectorAll('.ch-shs-rdot')].map((d) => Number(d.getAttribute('cx')));
    // Two days against nine: the last gap is 4.5 times a two-day gap.
    expect((xs[11]! - xs[10]!) / (xs[1]! - xs[0]!)).toBeCloseTo(4.5, 1);
  });

  it('rounds with no dates keep even spacing', () => {
    const c = draw(rounds([72, 74, 73]));
    const xs = [...c.querySelectorAll('.ch-shs-rdot')].map((d) => Number(d.getAttribute('cx')));
    expect(xs[1]! - xs[0]!).toBeCloseTo(xs[2]! - xs[1]!, 5);
  });
});

describe('scoring hero · a finger held still reads the round under it (0822e4af)', () => {
  // jsdom has no pointer capture; the chart takes it as the hold lands.
  const capture = vi.fn();
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  beforeEach(() => {
    vi.useFakeTimers();
    proto.setPointerCapture = capture;
    proto.hasPointerCapture = () => false;
  });
  afterEach(() => {
    vi.useRealTimers();
    capture.mockReset();
    delete proto.setPointerCapture;
    delete proto.hasPointerCapture;
  });
  const hold = (x: number) => {
    const onRead = vi.fn();
    const c = render(<ScoringFeatureChart rounds={rounds([74, 70, 77])} tone="flat" onRead={onRead} />).container;
    const chart = c.querySelector<HTMLElement>('[data-ch="stats-hero-chart"]')!;
    chart.getBoundingClientRect = () => ({ left: 100, top: 0, width: 320, height: H, right: 420, bottom: H, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(chart, { pointerType: 'touch', pointerId: 7, clientX: x });
    return { onRead, chart };
  };

  it('reads the nearest round once the hold lands, measured from the chart’s own left edge, and nothing before it', () => {
    const { onRead } = hold(104);
    act(() => vi.advanceTimersByTime(119));
    expect(onRead).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(capture).toHaveBeenCalledWith(7);
    expect(onRead).toHaveBeenLastCalledWith(0);
  });

  it('a hold at the far end reads the newest round', () => {
    const { onRead } = hold(400);
    act(() => vi.advanceTimersByTime(120));
    expect(onRead).toHaveBeenLastCalledWith(2);
  });
});

describe('scoring hero · the average is straight segments (CH-15)', () => {
  it('draws the rolling average with lines only, no curve commands', () => {
    const c = draw(rounds([74, 70, 77, 71, 75, 69, 73], [1, 3, 4, 12, 13, 20, 28]));
    const d = c.querySelector('.ch-shs-avgline')!.getAttribute('d')!;
    expect(d).toMatch(/^M/);
    expect(d).not.toMatch(/C/);
  });
});

describe('team hero · round days sit by their dates (CH-11)', () => {
  const xs = (days: Array<{ label: string; score: number; n: number; date?: string }>) =>
    [...render(<TeamFeatureChart days={days} />).container.querySelectorAll('.ch-shs-rdot')].map((d) => Number(d.getAttribute('cx')));

  it('a month between two round days draws wider than the days a week apart', () => {
    const x = xs([
      { label: 'Sep 1', score: 74, n: 6, date: '2026-09-01' },
      { label: 'Sep 3', score: 75, n: 6, date: '2026-09-03' },
      { label: 'Sep 5', score: 73, n: 6, date: '2026-09-05' },
      { label: 'Oct 5', score: 74, n: 6, date: '2026-10-05' },
    ]);
    expect(x[3]! - x[2]!).toBeGreaterThan(3 * (x[1]! - x[0]!));
  });

  it('days with no dates keep even spacing', () => {
    const x = xs([
      { label: 'Sep 1', score: 74, n: 6 },
      { label: 'Sep 3', score: 75, n: 6 },
      { label: 'Oct 5', score: 73, n: 6 },
    ]);
    expect(x[1]! - x[0]!).toBeCloseTo(x[2]! - x[1]!, 5);
  });
});

describe('team hero · against par when every day has it (CH-01)', () => {
  // The same golf, +2 a round, on par-70, par-72 and par-71 courses: the strokes move, the golf does not.
  const days = [
    { label: 'Sep 1', score: 72, toPar: 2, n: 6, date: '2026-09-01' },
    { label: 'Sep 8', score: 74, toPar: 2, n: 6, date: '2026-09-08' },
    { label: 'Sep 15', score: 73, toPar: 2, n: 6, date: '2026-09-15' },
  ];

  it('draws one flat line, the dashed line is par and named so, and the reading is against par', () => {
    const c = render(<TeamFeatureChart days={days} />).container;
    const ys = [...c.querySelectorAll('.ch-shs-rdot')].map((d) => Number(d.getAttribute('cy')));
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 5);
    expect(c.querySelector('.ch-shs-mean-key')!.textContent).toBe('Par · under par sits higher');
    // Under par sits higher: par's dashed line is above the +2 days.
    expect(Number(c.querySelector('.ch-shs-parline')!.getAttribute('y1'))).toBeLessThan(ys[0]!);
    expect(c.querySelector('[role="img"]')!.getAttribute('aria-label')).toMatch(/^Team score against par, per 18 holes, by round day, from \+2\.0 to \+2\.0\. Under par sits higher\./);
  });

  it('a day with no figure against par keeps the whole chart in strokes, with no par line', () => {
    const c = render(<TeamFeatureChart days={[...days.slice(0, 2), { ...days[2]!, toPar: null }]} />).container;
    expect(c.querySelector('.ch-shs-mean-key')!.textContent).toBe('Lower scores sit higher');
    expect(c.querySelector('.ch-shs-parline')).toBeNull();
    expect(c.querySelector('[role="img"]')!.getAttribute('aria-label')).toMatch(/^Team scoring average by round day, from 72\.0 to 73\.0\./);
  });
});
