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
const ticks = () => [...document.querySelectorAll('.ch-th-trend text.ch-th-ax.ch-num')].map((t) => t.textContent);

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
});
