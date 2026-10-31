import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Surface } from '../Surface';
import { StatsInsight } from '../../screens/stats/StatsInsight';

// F-0063: a Surface that is a page's top-level section takes an h2, so the outline does not skip from the page h1 to h3.
describe('Surface heading level', () => {
  it('is an h3 by default and an h2 with level={2}', () => {
    const { unmount } = render(<Surface id="a" title="Inside a zone" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Inside a zone' })).toBeTruthy();
    unmount();
    render(<Surface id="b" title="Top of the page" level={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Top of the page' })).toBeTruthy();
  });
  it('the Stats insight card, first under the page h1, is an h2', () => {
    render(<StatsInsight insight={{ state: 'none', against: 'against the last 10' } as never} />);
    expect(screen.getByRole('heading', { level: 2, name: 'No clear change' })).toBeTruthy();
  });
});
