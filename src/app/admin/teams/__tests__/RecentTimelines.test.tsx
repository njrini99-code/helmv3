import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PulseTeamRow } from '@/lib/admin/data/pulse-grid';
import { RecentTimelines } from '@/app/admin/teams/RecentTimelines';

/**
 * `RecentTimelines` lives in its own module (not inlined in page.tsx) for two
 * reasons: `admin-gate-coverage.test.ts` requires every exported function in
 * a page.tsx/layout.tsx/actions file to itself reach requireSuperAdmin(),
 * which a presentational strip has no reason to do (the page's own gate
 * already covers the tree); and testing it directly here sidesteps
 * `TeamsPulsePage`'s async `Body` behind a `Suspense` boundary — `render()`
 * in this jsdom/vitest setup mounts the `PanelPageSkeleton` fallback and
 * never resolves it, same reason the existing `AdminBaseballPage` test only
 * asserts on page-scaffold structure and never on `BaseballBody`'s fetched
 * content.
 */
function team(overrides: Partial<PulseTeamRow> = {}): PulseTeamRow {
  return {
    teamId: 'team-1',
    name: 'Demo Golf',
    sport: 'golf',
    playerCount: 10,
    buckets: [],
    lastActivityDate: '2026-08-20',
    daysSinceActivity: 5,
    halo: 'cooling',
    activity30d: 12,
    errors30d: 0,
    criticalErrors30d: 0,
    attentionScore: 4,
    href: '/admin/teams/team-1',
    threadHref: '/admin/thread/team/team-1',
    ...overrides,
  };
}

describe('RecentTimelines', () => {
  it('links to /admin/thread rows, most-recently-active team first', () => {
    render(
      <RecentTimelines
        teams={[
          team({ teamId: 'team-older', name: 'Older Team', lastActivityDate: '2026-08-10', threadHref: '/admin/thread/team/team-older' }),
          team({ teamId: 'team-newer', name: 'Newer Team', lastActivityDate: '2026-08-24', threadHref: '/admin/thread/team/team-newer' }),
          // A team with no activity in the 30d window must never fabricate a timeline row.
          team({ teamId: 'team-silent', name: 'Silent Team', lastActivityDate: null, halo: 'silent', threadHref: '/admin/thread/team/team-silent' }),
        ]}
      />,
    );

    expect(screen.getByText('Recent timelines')).toBeInTheDocument();

    const newerLink = screen.getByRole('link', { name: /Newer Team/ });
    const olderLink = screen.getByRole('link', { name: /Older Team/ });
    expect(newerLink).toHaveAttribute('href', '/admin/thread/team/team-newer');
    expect(olderLink).toHaveAttribute('href', '/admin/thread/team/team-older');
    expect(screen.queryByRole('link', { name: /Silent Team/ })).not.toBeInTheDocument();

    // Most-recently-active team renders before the older one, regardless of
    // whatever sort the full Teams pulse table below is currently using.
    const position = newerLink.compareDocumentPosition(olderLink);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('caps the strip at six teams', () => {
    const teams = Array.from({ length: 9 }, (_, i) =>
      team({ teamId: `team-${i}`, name: `Team ${i}`, lastActivityDate: `2026-08-${10 + i}`, threadHref: `/admin/thread/team/team-${i}` }),
    );
    render(<RecentTimelines teams={teams} />);
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('falls back to the honest explainer line when no team has recent activity', () => {
    render(<RecentTimelines teams={[team({ lastActivityDate: null, halo: 'silent' })]} />);
    expect(screen.getByText('Rows open a full timeline →')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
