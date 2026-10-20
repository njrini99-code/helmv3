import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PREVIEW_PLAYER } from '../preview/fixtures-stats';
import { RoundTrend } from '../screens/stats/RoundTrend';
import { meanSeries, niceTicks, parLine, readTrendRound, trendNote, trendRounds, trendState, type TrendRound } from '../screens/stats/round-trend';

const round = (i: number, value: number | null, extra: Partial<TrendRound> = {}): TrendRound => ({ id: `r${i}`, label: `Sep ${i + 1}`, course: 'Finley GC', value, toPar: value == null ? null : value - 72, holes: 18, ...extra });
const scores = (vals: Array<number | null>) => vals.map((v, i) => round(i, v));

describe('round-trend helpers', () => {
  it('draws the trailing mean from the third round and trails five', () => {
    const m = meanSeries(scores([74, 72, 73, 75, 71, 70]));
    expect(m.slice(0, 2)).toEqual([null, null]);
    expect(m[2]).toBeCloseTo(73, 5);
    expect(m[5]).toBeCloseTo((72 + 73 + 75 + 71 + 70) / 5, 5);
  });

  it('puts par at the typical par of the rounds, and nowhere when a round has no to par', () => {
    expect(parLine(scores([74, 72, 73]))).toBe(72);
    const rs = scores([74, 72, 73]);
    rs[1] = { ...rs[1]!, toPar: null };
    expect(parLine(rs)).toBeNull();
    expect(parLine([])).toBeNull();
  });

  it('floors the line: scores are early under five rounds, strokes gained under eight', () => {
    expect(trendState('score', scores([74, 72, 73, 75]))).toBe('early');
    expect(trendState('score', scores([74, 72, 73, 75, 71]))).toBe('steady');
    expect(trendState('sg', scores([1, 2]))).toBe('none');
    expect(trendState('sg', scores([1, 2, 3, 4, 5, 6, 7]))).toBe('early');
    // A round with no figure is not a round for the floor.
    expect(trendState('score', scores([74, null, 73, 75, 71]))).toBe('early');
  });

  it('picks round ticks that cover the range', () => {
    expect(niceTicks(71.2, 76.1, 3)).toEqual([72, 74, 76]);
    expect(niceTicks(-1.6, 1.4, 3)).toEqual([-1, 0, 1]);
  });

  it('reads a round: date, course, figure, the average; a nine-hole round says it was doubled', () => {
    expect(readTrendRound('score', round(22, 73), 74.2)).toBe('Sep 23 · Finley GC · 73, +1 · 5-round average 74.2');
    expect(readTrendRound('sg', round(0, 0.64, { toPar: null }), null)).toBe('Sep 1 · Finley GC · +0.6 strokes gained');
    expect(readTrendRound('score', round(3, 78, { holes: 9 }), null)).toContain('(9 holes, doubled)');
    expect(readTrendRound('sg', round(3, null), null)).toBe('Sep 4 · Finley GC · No strokes gained logged');
  });

  it('rests on what a dot and the line are, with the early tag while thin', () => {
    expect(trendNote('score', scores([74, 72, 73, 75, 71, 70]))).toBe('Each dot is a round. The line is the 5-round average.');
    expect(trendNote('score', scores([74, 72, 73]))).toBe('Each dot is a round. The line is the 5-round average. Early read · 3 rounds.');
    expect(trendNote('score', scores([74, 72]))).toBe('Each dot is a round. The average line starts at the third. Early read · 2 rounds.');
  });

  it('turns the profile’s newest-first rounds into oldest-first values per 18 holes', () => {
    const [a, b] = PREVIEW_PLAYER.rounds;
    const out = trendRounds([{ ...a!, holes: 9, score: 40, toPar: 4, sg: -1 }, b!], 'score');
    expect(out.map((r) => r.id)).toEqual([b!.id, a!.id]);
    expect(out[1]!.value).toBe(80);
    expect(out[1]!.toPar).toBe(8);
    expect(trendRounds([{ ...a!, holes: 9, sg: -1 }], 'sg')[0]!.value).toBe(-2);
    expect(trendRounds([{ ...a!, sg: null }], 'sg')[0]!.value).toBeNull();
  });
});

describe('RoundTrend', () => {
  const ten = scores([74, 72, 73, 75, 71, 70, 76, 73, 74, 72]);
  const show = (rounds = ten, openHref?: (id: string) => string | null, kind: 'score' | 'sg' = 'score') =>
    render(<RoundTrend rounds={rounds} kind={kind} label="Scores over the last rounds." openHref={openHref} />);
  const plot = () => document.querySelector('.ch-sv-rt__svg') as SVGElement;
  const read = () => document.querySelector('.ch-sv-read')!.textContent;
  const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
  // jsdom has no layout: the plot is 340 wide from x 0, and the dots' columns sit inside the 34 and 14 inset.
  const withBox = () => {
    const el = plot();
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 340, bottom: 168, width: 340, height: 168, x: 0, y: 0, toJSON() {} }) as DOMRect;
    return el;
  };
  // Column i's centre: 34 + (i + 0.5) / 10 * 292.
  const colX = (i: number) => 34 + ((i + 0.5) / 10) * 292;

  it('is a focusable group naming the chart; the plot itself is hidden from a screen reader', () => {
    show();
    const g = screen.getByRole('group');
    expect(g.getAttribute('tabindex')).toBe('0');
    expect(g.getAttribute('aria-label')).toMatch(/^Scores over the last rounds\. Use the arrow keys/);
    expect(plot().getAttribute('aria-hidden')).toBe('true');
  });

  it('draws a dot per round and the line from the third, a par line and the cue; ten steady rounds are solid', () => {
    show();
    expect(document.querySelectorAll('.ch-sv-rt__dot')).toHaveLength(10);
    expect(document.querySelectorAll('.ch-sv-rt__dot.is-hollow')).toHaveLength(0);
    expect(document.querySelector('.ch-sv-rt__mean')!.getAttribute('d')).toMatch(/^M/);
    expect(plot().textContent).toContain('Par 72');
    expect(plot().textContent).toContain('↑ Lower is better');
  });

  it('an early read draws hollow dots and says so', () => {
    show(scores([74, 72, 73]));
    expect(document.querySelectorAll('.ch-sv-rt__dot.is-hollow')).toHaveLength(3);
    expect(read()).toContain('Early read · 3 rounds');
  });

  it('better scores sit higher: a lower score has a smaller y', () => {
    show(scores([70, 78, 74]));
    const ys = [...document.querySelectorAll('.ch-sv-rt__dot')].map((c) => parseFloat(c.getAttribute('cy')!));
    expect(ys[0]!).toBeLessThan(ys[2]!);
    expect(ys[2]!).toBeLessThan(ys[1]!);
  });

  it('a mouse over the plot reads the nearest round, nothing is announced, and leaving lets go', () => {
    show();
    const el = withBox();
    fireEvent.pointerMove(el, { pointerType: 'mouse', clientX: colX(2) });
    expect(read()).toBe('Sep 3 · Finley GC · 73, +1 · 5-round average 73.0');
    expect(live()).toBe('');
    expect(document.querySelector('.ch-sv-rt__guide')).not.toBeNull();
    fireEvent.pointerLeave(el, { pointerType: 'mouse' });
    expect(read()).toContain('Each dot is a round');
  });

  it('a tap pins the nearest round and announces it; a second tap there lets go', () => {
    show();
    const el = withBox();
    fireEvent.pointerDown(el, { pointerType: 'touch', clientX: colX(5), clientY: 80 });
    fireEvent.pointerUp(el, { pointerType: 'touch', clientX: colX(5), clientY: 80 });
    expect(read()).toMatch(/^Sep 6 /);
    expect(live()).toBe(read());
    expect(document.querySelectorAll('.ch-sv-rt__dot.is-active')).toHaveLength(1);
    fireEvent.pointerDown(el, { pointerType: 'touch', clientX: colX(5), clientY: 80 });
    fireEvent.pointerUp(el, { pointerType: 'touch', clientX: colX(5), clientY: 80 });
    expect(live()).toBe('');
  });

  it('a sideways drag scrubs after 8px and keeps where it ended; a vertical swipe never scrubs', () => {
    show();
    const el = withBox();
    el.setPointerCapture = () => {};
    fireEvent.pointerDown(el, { pointerType: 'touch', clientX: colX(1), clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: colX(1) + 4, clientY: 80, pointerId: 1 });
    expect(read()).toContain('Each dot is a round');
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: colX(4), clientY: 82, pointerId: 1 });
    expect(read()).toMatch(/^Sep 5 /);
    fireEvent.pointerUp(el, { pointerType: 'touch', clientX: colX(7), clientY: 82, pointerId: 1 });
    expect(live()).toMatch(/^Sep 8 /);

    // A mostly vertical move starts nothing; the browser takes it and sends a cancel.
    fireEvent.pointerDown(el, { pointerType: 'touch', clientX: colX(2), clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(el, { pointerType: 'touch', clientX: colX(2) + 10, clientY: 60, pointerId: 2 });
    fireEvent.pointerCancel(el, { pointerType: 'touch', pointerId: 2 });
    expect(live()).toMatch(/^Sep 8 /);
  });

  it('keys step from the newest, announce, and Esc clears', () => {
    show();
    const g = screen.getByRole('group');
    fireEvent.keyDown(g, { key: 'ArrowLeft' });
    expect(live()).toMatch(/^Sep 10 /);
    fireEvent.keyDown(g, { key: 'ArrowLeft' });
    expect(live()).toMatch(/^Sep 9 /);
    fireEvent.keyDown(g, { key: 'Home' });
    expect(live()).toMatch(/^Sep 1 /);
    fireEvent.keyDown(g, { key: 'Escape' });
    expect(live()).toBe('');
  });

  it('offers Open round only for a pinned round with somewhere to go, inside the chart so the press does not clear it', () => {
    show(ten, (id) => `/golf/dashboard/rounds/${id}`);
    expect(screen.queryByRole('link', { name: 'Open round' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('group'), { key: 'End' });
    const link = screen.getByRole('link', { name: 'Open round' });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/rounds/r9');
    expect(screen.getByRole('group').contains(link)).toBe(true);
    // A press on the link is inside the chart: the pin stays.
    fireEvent.pointerDown(link);
    expect(screen.getByRole('link', { name: 'Open round' })).toBeTruthy();
    // A press anywhere else lets go.
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole('link', { name: 'Open round' })).toBeNull();
  });

  it('draws no link where the review is not rebuilt for the viewer', () => {
    show(ten, () => null);
    fireEvent.keyDown(screen.getByRole('group'), { key: 'End' });
    expect(screen.queryByRole('link', { name: 'Open round' })).toBeNull();
  });

  it('strokes gained: a zero line, better is up, and two rounds say what is needed instead of a chart', () => {
    show(scores([1.2, -0.4, 0.8, -1.5, 0.3, 0.9, -0.2, 0.6]), undefined, 'sg');
    expect(plot().textContent).toContain('Zero is the Tour');
    expect(plot().textContent).not.toContain('Lower is better');
    const ys = [...document.querySelectorAll('.ch-sv-rt__dot')].map((c) => parseFloat(c.getAttribute('cy')!));
    expect(ys[0]!).toBeLessThan(ys[1]!);
    document.body.innerHTML = '';
    show(scores([1.2, -0.4]), undefined, 'sg');
    expect(document.body.textContent).toContain('Needs 3 rounds with shots. 2 so far.');
    expect(document.querySelector('.ch-sv-rt__svg')).toBeNull();
  });

  it('one scored round says so instead of drawing a line', () => {
    show([round(0, 74)]);
    expect(document.body.textContent).toContain('One round so far: 74 on Sep 1. The trend draws from the second.');
  });
});
