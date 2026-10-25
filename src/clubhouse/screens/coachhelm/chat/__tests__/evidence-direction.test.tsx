import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A8.1: Ask's trend chart draws better as up. For a lower-is-better metric the newer, lower value sits higher on screen (a
 * smaller y), the chart says "Lower is better", and the axis carries round-number ticks.
 */

vi.mock('../../../../lib/rail-fold', () => ({ afterRailMove: (f: () => void) => f() }));

import type { AskEvidence } from '../../../../data/coachhelm-chat-thread';
import { Trend } from '../Evidence';

afterEach(cleanup);

type TrendBlock = Extract<AskEvidence, { kind: 'trend' }>;
const block = (goodDirection: TrendBlock['goodDirection'], values: number[]): TrendBlock =>
  ({
    kind: 'trend',
    title: 'Scoring average',
    source: null,
    unit: 'score',
    points: values.map((value, i) => ({ label: `R${i + 1}`, value, n: 1 })),
    reference: null,
    summary: 'Scoring average by round.',
    goodDirection,
  }) as unknown as TrendBlock;

const dotsY = () => [...document.querySelectorAll('.ch-th-trend circle')].map((c) => Number(c.getAttribute('cy')));
/** The y axis's tick labels (end-anchored at the left); the x labels name the rounds. */
const ticks = () => [...document.querySelectorAll('.ch-th-trend text.ch-line__t[text-anchor="end"]:not(.ch-line__ref-t)')].map((t) => t.textContent);

describe('the Ask trend draws better as up (A8.1)', () => {
  it('lower is better: the latest, lower score is higher on screen, and the chart says so', () => {
    render(<Trend block={block('down', [78, 76, 73])} />);
    const [first, , last] = dotsY();
    expect(last!).toBeLessThan(first!);
    expect(document.querySelector('.ch-th-dir')?.textContent).toBe('Lower is better');
    expect(document.querySelector('.ch-th-trend')!.getAttribute('aria-label')).toContain('Lower is better.');
  });

  it('higher is better keeps higher values up, with no caption', () => {
    render(<Trend block={block('up', [50, 55, 60])} />);
    const [first, , last] = dotsY();
    expect(last!).toBeLessThan(first!);
    expect(document.querySelector('.ch-th-dir')).toBeNull();
  });

  it('the axis ticks are round numbers, each printed once', () => {
    render(<Trend block={block('down', [78.3, 76.1, 73.4])} />);
    const t = ticks();
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(new Set(t).size).toBe(t.length);
    for (const label of t) expect(Number(label)).toSatisfy((v: number) => Number.isInteger(v * 2));
  });

  it('the reference’s words never sit on a drawn point (P013 D3), placed from the points as Line draws them', () => {
    // The last rounds run along the reference at the right, where its words would go first.
    const b = { ...block('down', [70, 76, 74, 74, 74]), reference: { label: 'Team', value: 74 } } as TrendBlock;
    render(<Trend block={b} />);
    const t = document.querySelector('.ch-th-trend .ch-line__ref-t');
    const circles = [...document.querySelectorAll('.ch-th-trend circle')].map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
    expect(circles).toHaveLength(5);
    if (!t) {
      // No clear place: the words are a key under the chart.
      expect(document.querySelector('.ch-th-trend .ch-line__key')?.textContent).toBe('Team');
      return;
    }
    const x = Number(t.getAttribute('x'));
    const y = Number(t.getAttribute('y'));
    const w = 'Team'.length * 6.6;
    const x0 = t.getAttribute('text-anchor') === 'end' ? x - w : x;
    for (const p of circles) if (p.x >= x0 && p.x <= x0 + w) expect(p.y + 5 < y - 11 || p.y - 5 > y + 3).toBe(true);
  });

  it('the older points are hollow and the last is filled', () => {
    render(<Trend block={block('up', [50, 55, 60])} />);
    const dots = [...document.querySelectorAll('.ch-th-trend circle')];
    expect(dots.map((d) => d.classList.contains('is-hollow'))).toEqual([true, true, false]);
  });
});
