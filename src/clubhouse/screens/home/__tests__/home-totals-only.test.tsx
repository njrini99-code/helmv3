import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

import { PREVIEW_HOME, PREVIEW_HOME_LEGS_NO_HOLES, PREVIEW_HOME_ONE_DAY, PREVIEW_HOME_TOTALS_ONLY } from '../../../preview/fixtures';
import { CoachHome } from '../CoachHome';
import { figureMissing } from '../HomePhone';

afterEach(cleanup);

const NOW = '2026-10-14T18:40:00.000Z';

/** Rounds posted as totals carry no greens, putts or holes: Home says so where each figure would be, and never reads off nothing. */
describe('coach Home, totals-only rounds read as deliberate', () => {
  it('names why a figure is missing: no rounds carry it, or too few do', () => {
    expect(figureMissing(0)).toBe('Totals only so far');
    expect(figureMissing(0, 'Needs 2 rounds')).toBe('Totals only so far');
    expect(figureMissing(1, 'Needs 2 rounds')).toBe('Needs 2 rounds');
    expect(figureMissing(1)).toBe('Too few rounds');
  });

  it('Team scoring keeps a dash over the reason for greens and putts', () => {
    const { container } = render(<CoachHome data={PREVIEW_HOME_TOTALS_ONLY} now={NOW} />);
    expect(screen.getAllByText('Totals only so far')).toHaveLength(2);
    // Two round days draw the line, so no sentence stands in for it.
    expect(container.querySelector('.ch-hm-form__svg')).not.toBeNull();
    expect(container.querySelector('.ch-hm-form__noline')).toBeNull();
  });

  it('one round day has no line to draw, and says when it starts', () => {
    const { container } = render(<CoachHome data={PREVIEW_HOME_ONE_DAY} now={NOW} />);
    expect(container.querySelector('.ch-hm-form__svg')).toBeNull();
    expect(screen.getByText('The line starts with a second round day.')).toBeTruthy();
  });

  it('a team with every figure keeps them, with no reason under them', () => {
    render(<CoachHome data={PREVIEW_HOME} now={NOW} />);
    expect(screen.queryByText('Totals only so far')).toBeNull();
    expect(screen.queryByText('The line starts with a second round day.')).toBeNull();
  });

  it('CH-2314 The team’s game with no hole-by-hole rounds says only that: no line about what costs the most', () => {
    const { container } = render(<CoachHome data={PREVIEW_HOME_LEGS_NO_HOLES} now={NOW} />);
    expect(container.querySelector('[data-ch-code="CH-2314"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/cost(s)? the most/);
    expect(container.textContent).not.toContain('Names open that player’s game on Stats.');
  });

  it('with hole-by-hole rounds the line about what costs the most stays', () => {
    const { container } = render(<CoachHome data={PREVIEW_HOME} now={NOW} />);
    expect(container.textContent).toMatch(/cost the most/);
  });
});
