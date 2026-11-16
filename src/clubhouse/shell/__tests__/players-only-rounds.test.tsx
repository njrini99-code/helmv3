import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayersOnlyRounds } from '../NotRebuilt';

afterEach(cleanup);

/** GAP-R-12: a coach on /rounds/new, /rounds/recover or /rounds/continue/[id] is told whose page it is (CH-11390). */
describe('a coach on a player’s round flow', () => {
  it('reads "Only players log rounds", with the way back to Rounds', () => {
    const { container } = render(<PlayersOnlyRounds />);
    expect(container.querySelector('[data-ch-code="CH-11390"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Only players log rounds');
    expect(screen.getByRole('link', { name: /Back to Rounds/ }).getAttribute('href')).toBe('/golf/dashboard/rounds');
    expect(container.textContent).not.toMatch(/isn’t available here/);
  });
});
