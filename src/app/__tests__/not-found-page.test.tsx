import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-M-02: the platform 404 is one calm page: a small icon, "We couldn’t find that page", one primary action and the
 * other places as quiet links, titled "Page not found · Helm". Golf admin uses the same page; GolfHelm's own 404
 * outside the dashboard is Clubhouse's (CH-1306, the sign-in room), since Clubhouse is GolfHelm's only UI.
 */
let pathname = '/nope';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { NotFoundView } = await import('../not-found-view');
const root = await import('../not-found');
const golf = await import('../golf/not-found');
const golfAdmin = await import('../golf/admin/not-found');
const { GateNotFound } = await import('@/clubhouse/screens/auth/GateError');

afterEach(cleanup);

describe('the platform 404', () => {
  it('names the tab, and a nested template cannot wrap it', () => {
    expect(root.metadata).toEqual({ title: { absolute: 'Page not found · Helm' } });
  });

  it('an unknown path: one primary, Home, and the products as quiet links', () => {
    pathname = '/this-page-does-not-exist';
    render(<NotFoundView />);
    expect(screen.getByRole('heading', { level: 1, name: 'We couldn’t find that page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
    const quiet = within(screen.getByRole('navigation', { name: 'Other places' })).getAllByRole('link');
    expect(quiet.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['GolfHelm', '/golf/dashboard'],
      ['BaseballHelm', '/baseball/dashboard'],
      ['Lift Lab', '/lifting/dashboard'],
    ]);
    // No giant "404", and no button-styled secondaries.
    expect(screen.queryByText('404')).toBeNull();
  });

  it('a product path promotes that product, Home becomes a quiet link', () => {
    pathname = '/lifting/dashboard/programs/x';
    render(<NotFoundView />);
    expect(screen.getByRole('link', { name: 'Go to Lift Lab' })).toHaveAttribute('href', '/lifting/dashboard');
    expect(within(screen.getByRole('navigation', { name: 'Other places' })).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('golf admin keeps the platform page', () => {
    expect(golfAdmin.default).toBe(root.default);
    expect(golfAdmin.metadata).toBe(root.metadata);
  });

  it('the golf 404 outside the dashboard is Clubhouse’s, in the sign-in room', () => {
    expect(golf.default().type).toBe(GateNotFound);
    expect(golf.metadata).toEqual({ title: 'Page not found' });
  });
});
