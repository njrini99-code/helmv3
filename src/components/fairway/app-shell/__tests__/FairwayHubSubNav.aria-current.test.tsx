/**
 * `aria-current="page"` must name the page you are ON — not the section you are in.
 *
 * `FairwayHubSubNav` resolves its active tab by longest-prefix match across
 * each tab's `href` plus its `matchPrefixes`, and then drove BOTH the visual
 * highlight and `aria-current` off that one boolean.
 *
 * The visual half is deliberate. `nav-registry.ts:193-200` gives the Team Stats
 * tab `matchPrefixes: ['/golf/dashboard/stats']` precisely so the strip — and
 * the owning "Rounds & Stats" rail item — stay lit while a coach is on the
 * `/stats` drill-down, instead of going dark now that `/stats` has no tab of
 * its own. That is a considered decision and this file does not change it.
 *
 * The `aria-current` half is not defensible. Measured in production on
 * 2026-08-17 with `location.pathname = '/golf/dashboard/stats'`, THREE elements
 * claimed `aria-current="page"` and two of them pointed at a different URL
 * (`/golf/dashboard/stats/team`). A screen-reader user is told two different
 * links are the page they are on, and the sub-nav announces "Team Stats,
 * current page" while the body copy tells them to go open Team Stats.
 *
 * ARIA's own definition: `aria-current="page"` marks "the current page within a
 * set of pages". A tab whose href is a page the user is NOT on may be styled as
 * the active section, but it is not the current page.
 *
 * Issue #1480.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FairwayHubSubNav } from '@/components/fairway/app-shell/FairwayHubSubNav';
import type { GolfSubTab } from '@/lib/golf/nav-registry';

let pathname = '/golf/dashboard/stats';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

// The real strip animates its underline with framer-motion's layoutId; the
// component only needs the primitives to exist for a render assertion.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => <span {...rest}>{children}</span>,
    },
  ),
  useReducedMotion: () => true,
}));

const TABS = [
  {
    id: 'team-stats',
    label: 'Team Stats',
    href: '/golf/dashboard/stats/team',
    // Verbatim from nav-registry.ts — this prefix is the whole point.
    matchPrefixes: ['/golf/dashboard/stats'],
  },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds' },
  { id: 'qualifiers', label: 'Qualifiers', href: '/golf/dashboard/qualifiers' },
] as unknown as readonly GolfSubTab[];

afterEach(cleanup);

describe('FairwayHubSubNav — aria-current names the page, not the section', () => {
  it('marks NO tab as the current page when the route only matches a prefix', () => {
    // /golf/dashboard/stats is the coach interstitial. It is inside the Team
    // Stats tab's section, but it is NOT /golf/dashboard/stats/team.
    pathname = '/golf/dashboard/stats';
    render(<FairwayHubSubNav tabs={TABS} ariaLabel="Rounds & Stats sections" />);

    const teamStats = screen.getByRole('link', { name: /Team Stats/i });
    expect(teamStats).toHaveAttribute('href', '/golf/dashboard/stats/team');
    expect(teamStats).not.toHaveAttribute('aria-current');

    // And nothing else grabs it either — exactly zero current pages here.
    for (const name of [/Rounds/i, /Qualifiers/i]) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
  });

  it('marks exactly one tab current when the route IS that tab', () => {
    pathname = '/golf/dashboard/stats/team';
    render(<FairwayHubSubNav tabs={TABS} ariaLabel="Rounds & Stats sections" />);

    expect(screen.getByRole('link', { name: /Team Stats/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Rounds/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /Qualifiers/i })).not.toHaveAttribute('aria-current');
  });

  it('keeps a deeper leaf route under a tab marked as current', () => {
    // A detail page genuinely inside the tab's own href still IS that section's
    // page in the nav sense — `/rounds/abc` is the Rounds tab. Only a SIBLING
    // prefix (the /stats case above) must not claim it.
    pathname = '/golf/dashboard/rounds/round-123';
    render(<FairwayHubSubNav tabs={TABS} ariaLabel="Rounds & Stats sections" />);

    expect(screen.getByRole('link', { name: /Rounds/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Team Stats/i })).not.toHaveAttribute('aria-current');
  });
});
