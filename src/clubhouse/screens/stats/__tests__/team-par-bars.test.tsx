import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parBarPath, TeamFeatureChart, type TeamDay } from '../ScoringFeatureChart';
import { barYs } from './_bars';

afterEach(cleanup);

// Owner, 27 Nov 2026 ("Now I want it completely redesigned"): the team's Scoring average card draws each round day as a bar from par.
// A shorter bar is better golf, a day under par rises above the line in the gain fill, and the newest day is drawn bright.

const day = (label: string, toPar: number, n = 6): TeamDay => ({ label, score: 72 + toPar, toPar, n });

const draw = (days: TeamDay[]) => {
  const c = render(<TeamFeatureChart days={days} />).container;
  const bars = [...c.querySelectorAll('.ch-shs-tbar')];
  const par = Number(c.querySelector('.ch-shs-tbars__par')!.getAttribute('y1'));
  const geo = bars.map((b) => barYs(b.getAttribute('d')!));
  return { c, bars, par, geo, len: geo.map((g) => g.bottom - g.top) };
};

describe('a bar from par', () => {
  it('is square where it meets par and rounded at its data end, both ways', () => {
    const down = parBarPath(10, 16, 50, 90);
    expect(down.startsWith('M10,50H26V86A4,4 0 0 1 22,90')).toBe(true);
    expect(barYs(down)).toEqual({ top: 50, bottom: 90, left: 10, right: 26 });
    const up = parBarPath(10, 16, 50, 20);
    expect(up.startsWith('M10,50V24A4,4 0 0 1 14,20')).toBe(true);
    expect(up.endsWith('V50Z')).toBe(true);
    expect(barYs(up)).toEqual({ top: 20, bottom: 50, left: 10, right: 26 });
  });

  it('keeps a short bar’s rounding inside the bar', () => {
    expect(parBarPath(0, 16, 50, 53)).toContain('A3,3');
    expect(parBarPath(0, 4, 50, 90)).toContain('A2,2');
  });
});

describe('the team card’s bars from par', () => {
  it('hangs a day over par below the line and raises a day under par above it, in the gain fill', () => {
    const { bars, par, geo } = draw([day('Sep 1', 2), day('Sep 8', -1), day('Sep 15', 1)]);
    expect(geo[0]!.top).toBeCloseTo(par, 5);
    expect(geo[0]!.bottom).toBeGreaterThan(par);
    expect(geo[1]!.bottom).toBeCloseTo(par, 5);
    expect(geo[1]!.top).toBeLessThan(par);
    expect(bars.map((b) => b.classList.contains('is-under'))).toEqual([false, true, false]);
  });

  it('draws length in proportion to strokes against par, from one zero', () => {
    const { len } = draw([day('Sep 1', 4), day('Sep 8', 2), day('Sep 15', 1)]);
    expect(len[0]! / len[1]!).toBeCloseTo(2, 5);
    expect(len[1]! / len[2]!).toBeCloseTo(2, 5);
  });

  // The preview's team, +2.8 to +1.4 over ten days: the bars stand on par, so the newest is drawn half the first, as it is.
  it('draws the preview’s ten days true to par: the newest bar is half the first', () => {
    const toPar = [2.8, 2.6, 2.2, 2.4, 1.9, 1.8, 1.1, 1.5, 1.6, 1.4];
    const { len } = draw(toPar.map((q, i) => day(`Oct ${i + 1}`, q)));
    expect(len[9]! / len[0]!).toBeCloseTo(0.5, 3); // paths are written to the hundredth
  });

  // A team within half a stroke of par must not fill the drawing: +0.2 and +0.4 would read as a big change beside "No clear change".
  it('keeps a team close to par short: the depth spans at least 3 strokes', () => {
    const { len } = draw([day('Sep 1', 0.2), day('Sep 8', 0.4), day('Sep 15', 0.3)]);
    // 160 tall, less 8 above par for its word and 27 for the date row: 125 for 3 strokes.
    expect(Math.max(...len)).toBeCloseTo((125 * 0.4) / 3, 1);
  });

  it('puts par at the top when every day is over it, and at the bottom when every day is under it', () => {
    const over = draw([day('Sep 1', 2), day('Sep 8', 3)]);
    expect(Math.min(...over.geo.map((g) => g.top))).toBeCloseTo(over.par, 5);
    cleanup();
    const under = draw([day('Sep 1', -2), day('Sep 8', -3)]);
    expect(Math.max(...under.geo.map((g) => g.bottom))).toBeCloseTo(under.par, 5);
    expect(under.par).toBeGreaterThan(over.par);
  });

  it('marks the newest day, and a day with one round as an outline', () => {
    const { bars } = draw([day('Sep 1', 2), day('Sep 8', 3, 1), day('Sep 15', 1)]);
    expect(bars.map((b) => b.classList.contains('is-last'))).toEqual([false, false, true]);
    expect(bars.map((b) => b.classList.contains('is-one'))).toEqual([false, true, false]);
  });

  it('draws a day at level par as a short stub, so it is still a mark', () => {
    const { len } = draw([day('Sep 1', 0), day('Sep 8', 2)]);
    expect(len[0]!).toBeCloseTo(3, 5);
  });

  // A bar's width carries no time: every day is the same mark in an even slot (CH-11 dates still space the strokes line).
  it('stands the days in even slots, whatever their dates', () => {
    const { geo } = draw([
      { ...day('Sep 1', 2), date: '2026-09-01' },
      { ...day('Sep 3', 2), date: '2026-09-03' },
      { ...day('Oct 5', 2), date: '2026-10-05' },
    ]);
    const mid = geo.map((g) => (g.left + g.right) / 2);
    expect(mid[1]! - mid[0]!).toBeCloseTo(mid[2]! - mid[1]!, 5);
  });

  it('keeps 2 px between bars when the window is crowded', () => {
    const { geo } = draw(Array.from({ length: 40 }, (_, i) => day(`D${i}`, 1 + (i % 3))));
    for (let i = 1; i < geo.length; i++) expect(geo[i]!.left - geo[i - 1]!.right).toBeGreaterThanOrEqual(1.98); // paths are written to the hundredth
  });

  // The card's figure is the only average on it (W26, F-0009, STATS-P-04): the drawing names par and its two end dates, nothing else.
  it('writes no number in the drawing, only par and the two end dates', () => {
    const { c } = draw([day('Aug 30', 2.8), day('Sep 20', 1.9), day('Oct 12', 1.4)]);
    expect([...c.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual(['Par', 'Aug 30', 'Oct 12']);
    expect(c.textContent).not.toMatch(/avg|mean|average|\d\.\d/i);
  });

  it('says what it draws, for VoiceOver', () => {
    const { c } = draw([day('Aug 30', 2.8, 1), day('Sep 20', 0), day('Oct 12', -1.4)]);
    expect(c.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe(
      'Team score against par, per 18 holes, by round day, from +2.8 on Aug 30 to −1.4 on Oct 12. Bars hang below par for days over par and rise above it for days under par. 1 day with one round is drawn hollow.',
    );
  });
});
