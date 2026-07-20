// @vitest-environment jsdom
import { createElement } from 'react';
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
  // Spine & Stage (2026-07-19, plan Task 8): Development / Game Profile /
  // Standing are now `?view=` drills of the Overview home — the stage IS the
  // player nav for that content, so the strip collapses to the single
  // Overview tab (still mounted by e.g. the player Stats identity shell).
  it('renders the single consolidated Overview tab with its canonical route', () => {
    render(createElement(CoachHelmSubNav, { active: 'brief', role: 'player' }));

    const overview = screen.getByRole('link', { name: 'Overview' });
    expect(overview.getAttribute('href')).toBe('/golf/dashboard/coachhelm');
    expect(overview.getAttribute('aria-current')).toBe('page');

    // Exactly one player tab — the retired Development / Game Profile /
    // Standing tabs (now legacy+hidden in the registry) must NOT render, nor
    // must the coach-only surfaces (Signals / Effectiveness / Ask).
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Development' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Game Profile' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Standing' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Signals' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Effectiveness' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ask' })).toBeNull();
  });

  // Spine & Stage (2026-07-19, plan Task 9): Signals / Players / Effectiveness
  // are now `?view=` drills of the Brief home — the stage IS the coach nav for
  // that content, so the strip collapses to the single Brief tab (same shape
  // as the player Overview consolidation above).
  it('renders the single consolidated Brief tab with its canonical route', () => {
    render(createElement(CoachHelmSubNav, { active: 'brief', role: 'coach' }));

    const brief = screen.getByRole('link', { name: 'Brief' });
    expect(brief.getAttribute('href')).toBe('/golf/dashboard/intelligence');
    expect(brief.getAttribute('aria-current')).toBe('page');

    // Exactly one coach tab — the retired Signals / Players / Effectiveness
    // tabs (now legacy+hidden in the registry) must NOT render.
    const nav = screen.getByRole('navigation', { name: 'CoachHelm sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Signals' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Players' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Effectiveness' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ask' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Standing' })).toBeNull();
  });
});
