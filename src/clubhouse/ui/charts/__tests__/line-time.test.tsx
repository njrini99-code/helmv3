import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));

import { Line, slotPositions } from '../Line';
import { weekShares } from '../../../screens/stats/StatsTeamIslands';

afterEach(cleanup);

/** Row 119: dated points are spaced by real time, so unequal gaps draw as unequal spacing; undated ones keep the index. */
const day = (iso: string) => Date.parse(iso);

describe('real time on date axes (row 119)', () => {
  it('slotPositions: a two-week gap is twice a one-week gap; equal or missing times keep the index', () => {
    const p = slotPositions(3, [day('2026-09-01'), day('2026-09-08'), day('2026-09-22')]);
    expect(p[0]).toBeCloseTo(1 / 6, 9);
    expect(p[2]).toBeCloseTo(5 / 6, 9);
    expect(p[2]! - p[1]!).toBeCloseTo(2 * (p[1]! - p[0]!), 9);
    expect(slotPositions(3)).toEqual([1 / 6, 0.5, 5 / 6]);
    expect(slotPositions(3, [day('2026-09-01'), undefined, day('2026-09-22')])).toEqual([1 / 6, 0.5, 5 / 6]);
    expect(slotPositions(2, [day('2026-09-01'), day('2026-09-01')])).toEqual([0.25, 0.75]);
  });

  it('two rounds on one day (a 36-hole day) are two dots half a slot apart, and the pointer reaches each', () => {
    const p = slotPositions(4, [day('2026-09-01'), day('2026-09-08'), day('2026-09-08'), day('2026-09-22')]);
    expect(p[2]! - p[1]!).toBeGreaterThanOrEqual(0.5 / 4 - 1e-9);
    expect(p[0]).toBeCloseTo(1 / 8, 9);
    expect(p[3]).toBeCloseTo(7 / 8, 9);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
  });

  it('Line draws dated points at unequal spacing for unequal gaps', () => {
    render(
      <Line
        label="Team scores."
        points={[
          { x: 'Sep 1', y: 74, at: day('2026-09-01') },
          { x: 'Sep 8', y: 73, at: day('2026-09-08') },
          { x: 'Sep 22', y: 72, at: day('2026-09-22') },
        ]}
      />,
    );
    const xs = [...document.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cx')));
    expect(xs).toHaveLength(3);
    expect(xs[2]! - xs[1]!).toBeCloseTo(2 * (xs[1]! - xs[0]!), 0);
  });

  it('the desktop week chart spaces weeks by their first days', () => {
    expect(weekShares(3, ['2026-09-07', '2026-09-14', '2026-10-05'])).toEqual([0, 0.25, 1]);
    expect(weekShares(3, undefined)).toEqual([0, 0.5, 1]);
  });
});
