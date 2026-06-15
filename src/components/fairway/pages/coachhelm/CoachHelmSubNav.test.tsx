// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

// next/link drives prefetch through IntersectionObserver, which the jsdom setup
// mock isn't constructor-shaped for under this Next version. We only care about
// the rendered anchor (href / aria-current / label), so render a plain <a>.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CoachHelmSubNav } from './CoachHelmSubNav';

// The global setup mock returns usePathname() === '/', which matches no tab, so
// the component falls back to the SSR-known `active` prop. That is exactly the
// path we assert here (the pre-hydration paint).

describe('CoachHelmSubNav — player consolidation', () => {
  it('renders the three consolidated player tabs with their canonical routes', () => {
    render(<CoachHelmSubNav active="brief" role="player" />);

    const overview = screen.getByRole('link', { name: 'Overview' });
    const development = screen.getByRole('link', { name: 'Development' });
    const standing = screen.getByRole('link', { name: 'Standing' });

    expect(overview.getAttribute('href')).toBe('/golf/dashboard/coachhelm');
    expect(development.getAttribute('href')).toBe('/golf/dashboard/my-development');
    expect(standing.getAttribute('href')).toBe('/golf/dashboard/my-standing');

    // Exactly three player tabs — the scattered coach-only surfaces
    // (Signals / Effectiveness / Ask) must NOT leak into the player nav.
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: 'Signals' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Effectiveness' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ask' })).toBeNull();
  });

  it('paints the Standing tab as active from the SSR `active` prop', () => {
    render(<CoachHelmSubNav active="standing" role="player" />);

    const standing = screen.getByRole('link', { name: 'Standing' });
    expect(standing.getAttribute('aria-current')).toBe('page');

    // The other player tabs are not current.
    expect(
      screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Development' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('keeps the coach tab set intact (Standing is player-only)', () => {
    render(<CoachHelmSubNav active="brief" role="coach" />);

    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);

    expect(labels).toEqual(['Brief', 'Signals', 'Players', 'Effectiveness', 'Ask']);
    expect(screen.queryByRole('link', { name: 'Standing' })).toBeNull();
  });
});
