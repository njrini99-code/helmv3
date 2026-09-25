import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LieSplitBars, PathCrumbs, pathSteps } from '../SpotVisuals';

describe('LieSplitBars', () => {
  it('draws one row per lie and names a gaining lie as gained, not lost', () => {
    render(
      <LieSplitBars
        rows={[
          { label: 'Rough', sg: -0.42, n: 31 },
          { label: 'Fairway', sg: 0.08, n: 54 },
          { label: 'Thinner lies', sg: -0.03, n: null },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Strokes by lie' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Rough0.42lost · 31 shots');
    expect(rows[1]).toHaveTextContent('Fairway0.08gained · 54 shots');
    expect(rows[2]).toHaveTextContent('Thinner lies0.03lost');
    expect(rows[2]).not.toHaveTextContent('shots');
  });

  it('renders nothing with no rows', () => {
    const { container } = render(<LieSplitBars rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PathCrumbs', () => {
  it('splits a context path and lists each step in order', () => {
    const steps = pathSteps('175+ yd → par 4s → short');
    expect(steps).toEqual(['175+ yd', 'par 4s', 'short']);
    render(<PathCrumbs steps={steps} />);
    const items = within(screen.getByRole('list', { name: 'Where it concentrates' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace('›', '').trim())).toEqual(steps);
  });
});
