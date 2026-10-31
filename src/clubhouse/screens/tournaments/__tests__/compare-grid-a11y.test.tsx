import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { CompareGrid } from '../compare/CompareGrid';
import type { SideFigure } from '../compare/model';
import type { TourMetricKey } from '../metrics';

// F-0016: the table holds only rows. The divider (separator) and the foot sit beside it, not inside it.
const fig = (key: TourMetricKey, value: number): SideFigure =>
  ({ key, result: { key, value, n: 4, solid: true, excluded: [] }, state: 'solid', values: [value - 1, value, value + 1] }) as unknown as SideFigure;

describe('CompareGrid roles', () => {
  it('names one table whose children are all rows, with no aria-required-children violation', async () => {
    const keys: TourMetricKey[] = ['score_avg', 'to_par_avg'];
    const { container } = render(
      <CompareGrid
        keys={keys}
        a={{ score_avg: fig('score_avg', 74), to_par_avg: fig('to_par_avg', 2) }}
        b={{ score_avg: fig('score_avg', 76), to_par_avg: fig('to_par_avg', 4) }}
        labA="Spring"
        labB="Fall"
        onOpen={() => {}}
        split={0.5}
        onSplit={() => {}}
      />,
    );
    const table = screen.getByRole('table', { name: 'Comparison' });
    for (const child of Array.from(table.children)) expect(child.getAttribute('role')).toBe('row');
    const res = await axe.run(container, { runOnly: { type: 'rule', values: ['aria-required-children'] } });
    expect(res.violations).toEqual([]);
    expect(screen.getByRole('separator', { name: 'Resize A and B columns' })).toBeTruthy();
  });
});
