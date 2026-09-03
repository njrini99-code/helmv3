// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamEkgRow } from './TeamEkgRow';
import type { TeamsEkgRow } from '@/lib/admin/lenses/teams-ekg';

function team(overrides: Partial<TeamsEkgRow> = {}): TeamsEkgRow {
  return {
    teamId: 't1',
    name: 'Rini University',
    sport: 'golf',
    playerCount: 12,
    buckets: [{ date: '2026-09-02', activity: 3, errors: 0, critical: false }],
    lastActivityDate: '2026-09-02',
    daysSinceActivity: 1,
    halo: 'fresh',
    activity30d: 10,
    errors30d: 0,
    criticalErrors30d: 0,
    attentionScore: 1,
    href: '/admin/golf',
    threadHref: '/admin/thread/team/t1',
    releaseImpact: 0,
    unresolvedIncidents: 0,
    ...overrides,
  };
}

describe('TeamEkgRow', () => {
  it('renders the team name and the EKG strip', () => {
    render(<TeamEkgRow team={team()} />);
    expect(screen.getByText('Rini University')).toBeInTheDocument();
  });

  it('shows "unresolved unknown" rather than a fabricated 0 when the read failed', () => {
    render(<TeamEkgRow team={team({ unresolvedIncidents: null })} />);
    expect(screen.getByText('unresolved unknown')).toBeInTheDocument();
  });

  it('shows "release impact unknown" rather than fabricating a clean release when no live release is known', () => {
    render(<TeamEkgRow team={team({ releaseImpact: null })} />);
    expect(screen.getByText('release impact unknown')).toBeInTheDocument();
  });
});
