import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The dashboard's 404 is shared by both UIs. A `notFound()` from a page inside
 * the Clubhouse shell (Continue Round's missing round, an unmatched address)
 * must draw Clubhouse's not-here page, never the Fairway empty state; outside
 * the shell Fairway's page is unchanged.
 */

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => ({ userId: 'u-1', role: 'player', player: { id: 'p-1' } }),
}));

import { ClubhouseMarker } from '@/clubhouse/shell/context';
import GolfDashboardNotFound from '../not-found';

describe('dashboard not-found', () => {
  it('inside the Clubhouse shell: Clubhouse’s not-here page, one way back to Home', async () => {
    const el = (await GolfDashboardNotFound()) as ReactElement;
    render(
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      <ClubhouseMarker role="player">{el}</ClubhouseMarker>,
    );
    expect(screen.getByRole('heading', { name: 'This page isn’t here' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/golf/dashboard');
    expect(screen.queryByText('We couldn\'t find that')).toBeNull();
    expect(document.querySelector('.ch-empty-page')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/!/);
  });

  it('outside it: the Fairway page as before, with the role-aware secondary link', async () => {
    const el = (await GolfDashboardNotFound()) as ReactElement;
    render(el);
    expect(screen.getByText('We couldn\'t find that')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to dashboard' }).getAttribute('href')).toBe('/golf/dashboard');
    expect(screen.getByRole('link', { name: 'Your rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
    expect(screen.queryByText('This page isn’t here')).toBeNull();
  });
});
