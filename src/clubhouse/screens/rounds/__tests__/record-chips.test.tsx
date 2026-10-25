// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordChips } from '../RecordChips';

afterEach(cleanup);

describe('RecordChips (P-7 4.5.1)', () => {
  it('is a labelled list of at most two plain-text chips, the glyph hidden', () => {
    const { getByRole, container } = render(
      <RecordChips
        settle={false}
        marks={[
          { id: 'season-low', label: 'Season low', tier: 'filled', tie: false },
          { id: 'course-best', label: 'Best at Finley', tier: 'half', tie: false },
          { id: 'season-putts', label: 'Fewest putts this season · 27', tier: 'hollow', tie: false },
        ]}
      />,
    );
    const list = getByRole('list', { name: 'Records' });
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Season low', 'Best at Finley']);
    expect(container.querySelector('i')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('button, a')).toBeNull();
    expect(list.className).not.toContain('is-just');
  });

  it('draws nothing without a record, and settles only when asked', () => {
    expect(render(<RecordChips marks={[]} settle />).container.innerHTML).toBe('');
    const { getByRole } = render(<RecordChips marks={[{ id: 'career-low', label: 'Career low', tier: 'filled', tie: false }]} settle />);
    expect(getByRole('list').className).toContain('is-just');
  });
});
