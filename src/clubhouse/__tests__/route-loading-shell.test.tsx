import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Swap audit F-30: the loading boundary above the dashboard layout painted
 * Fairway's shell and dashboard skeleton on every cold entry, even with
 * Clubhouse on. With the flag on it must draw Clubhouse's frame.
 */
const flag = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
vi.mock('../lib/fonts', () => ({ clubhouseFontVariables: '' }));
vi.mock('@/components/fairway/app-shell/FairwayShellSkeleton', () => ({
  FairwayShellSkeleton: ({ children }: { children: React.ReactNode }) => <div data-fairway-shell>{children}</div>,
}));
vi.mock('@/components/fairway/pages/dashboard/FairwayDashboardSkeleton', () => ({
  FairwayDashboardSkeleton: () => <div data-fairway-dashboard />,
}));

import GolfLoading from '@/app/golf/loading';

describe('/golf loading boundary', () => {
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
});
