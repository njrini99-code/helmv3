import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompareGrid } from '../CompareGrid';
import type { SideFigure } from '../model';
import type { TourMetricKey } from '../../metrics';

/**
 * Tournament Compare's strips (stats and charts audit 2026-11-15, CH-14): one rule for the whole grid, better is to the right. The
 * strips always put the low value on the left, so the better side was the left for scoring and the right for greens in one grid.
 */
afterEach(cleanup);

const fig = (key: TourMetricKey, value: number): SideFigure =>
  ({ key, result: { key, value, n: 4, solid: true, excluded: [] }, state: 'solid', values: [value] }) as unknown as SideFigure;

/** Where each side's mean sits along its strip, A then B, as a share of the strip. */
function means(key: TourMetricKey, a: number, b: number): [number, number] {
  const { container } = render(
    <CompareGrid keys={[key]} a={{ [key]: fig(key, a) }} b={{ [key]: fig(key, b) }} labA="Spring" labB="Fall" onOpen={() => {}} split={0.5} onSplit={() => {}} />,
  );
  const at = [...container.querySelectorAll('.ch-tour-cmp-strip__mean')].map((m) => parseFloat((m as HTMLElement).style.left));
  return [at[0]!, at[1]!];
}

describe('CompareGrid strips · better is to the right (CH-14)', () => {
  it('scoring (lower is better): 70 sits right of 74', () => {
    const [a, b] = means('score_avg', 70, 74);
    expect(a).toBeGreaterThan(b);
  });

  it('greens in regulation (higher is better): 60% sits right of 50%', () => {
    const [a, b] = means('gir', 60, 50);
    expect(a).toBeGreaterThan(b);
  });

  it('the strip says which way is better', () => {
    const { container } = render(
      <CompareGrid keys={['score_avg']} a={{ score_avg: fig('score_avg', 70) }} b={{ score_avg: fig('score_avg', 74) }} labA="Spring" labB="Fall" onOpen={() => {}} split={0.5} onSplit={() => {}} />,
    );
    expect(container.querySelector('.ch-tour-cmp-m')!.textContent).toMatch(/better to the right/i);
  });
});
