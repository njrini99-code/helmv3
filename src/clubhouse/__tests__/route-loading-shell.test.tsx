import { afterEach, describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Swap audit F-30: the loading boundary above the dashboard layout painted
 * Fairway's shell and dashboard skeleton on every cold entry, even with
 * Clubhouse on. With the flag on it must draw Clubhouse's frame.
 */
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
// The boundary asks the gate, which is server-only and imports the session and team readers; it must not call them.
vi.mock('server-only', () => ({}));
const reads = vi.hoisted(() => ({ session: 0, team: 0 }));
vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: async () => {
    reads.session += 1;
    return null;
  },
}));
vi.mock('../routes/team', () => ({
  resolveClubhouseTeam: async () => {
    reads.team += 1;
    return null;
  },
}));
vi.mock('../lib/fonts', () => ({ clubhouseFontVariables: '' }));
vi.mock('@/components/fairway/app-shell/FairwayShellSkeleton', () => ({
  FairwayShellSkeleton: ({ children }: { children: React.ReactNode }) => <div data-fairway-shell>{children}</div>,
}));
vi.mock('@/components/fairway/pages/dashboard/FairwayDashboardSkeleton', () => ({
  FairwayDashboardSkeleton: () => <div data-fairway-dashboard />,
}));

import GolfLoading from '@/app/golf/loading';

describe('/golf loading boundary', () => {
  afterEach(() => {
    delete process.env.HELM_CLUBHOUSE_TEAMS;
  });

  it('draws the Clubhouse frame, not Fairway, when Clubhouse is on', () => {
    flag.on = true;
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-ui="clubhouse"]')).not.toBeNull();
    expect(container.querySelector('.ch-tabbar')).not.toBeNull();
    expect(container.querySelector('[data-fairway-shell]')).toBeNull();
    expect(container.querySelector('[data-fairway-dashboard]')).toBeNull();
  });

  it('keeps the Fairway skeleton when Clubhouse is off', () => {
    flag.on = false;
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-ui="clubhouse"]')).toBeNull();
    expect(container.querySelector('[data-fairway-shell]')).not.toBeNull();
  });

  it('paints neither frame while a team allowlist is set, since the team is not known yet', () => {
    // The gate gives a team outside HELM_CLUBHOUSE_TEAMS Fairway; drawing Clubhouse here flashed it and then swapped.
    flag.on = true;
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-ui="clubhouse"]')).toBeNull();
    expect(container.querySelector('[data-fairway-shell]')).toBeNull();
    expect(container.querySelector('[data-loading-frame="neutral"][role="status"]')).not.toBeNull();
    expect(reads).toEqual({ session: 0, team: 0 });
  });

  it('an allowlist with the flag off is still Fairway', () => {
    flag.on = false;
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-a';
    const { container } = render(<GolfLoading />);
    expect(container.querySelector('[data-fairway-shell]')).not.toBeNull();
  });
});
