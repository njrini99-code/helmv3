import './dialog-polyfill';
import { LazyMotion, domAnimation } from 'framer-motion';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Feedback before remote work (docs/clubhouse/PAGE_PERFORMANCE.md rule 2): a row that opens another page shows the page's hairline while that
 * page loads, as the nav rows do. `useLinkStatus` reports pending only inside a Next router, so it is answered here.
 */
const pending = vi.hoisted(() => ({ value: false }));
vi.mock('next/link', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/link')>()), useLinkStatus: () => ({ pending: pending.value }) }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { StatsTeam } from '../screens/stats/StatsTeam';
import { Leaderboard } from '../screens/home/Leaderboard';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_HOME } from '../preview/fixtures';
import { PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

const shell = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);

describe('Rows that open another page', () => {
  it('the team grid, the season bests and the leaderboard show the hairline and say "Loading" while their page loads, and nothing when idle', () => {
    pending.value = false;
    const idle = render(shell(<><StatsTeam data={PREVIEW_TEAM_STATS} /><Leaderboard data={PREVIEW_HOME.leaderboard} /></>));
    expect(idle.container.querySelector('.ch-lp')).toBeNull();
    idle.unmount();

    pending.value = true;
    const { container } = render(shell(<><StatsTeam data={PREVIEW_TEAM_STATS} /><Leaderboard data={PREVIEW_HOME.leaderboard} /></>));
    const inside = (selector: string) => [...container.querySelectorAll(selector)].filter((link) => link.querySelector('.ch-lp__bar'));
    expect(inside('a.ch-lg__r').length).toBe(PREVIEW_TEAM_STATS.grid.length);
    expect(inside('a.ch-who').length).toBe(PREVIEW_TEAM_STATS.bests.length);
    expect(inside('a.ch-h-lb__row').length).toBeGreaterThan(0);
    for (const link of container.querySelectorAll('a.ch-lg__r')) expect(link.querySelector('[role="status"]')!.textContent).toBe('Loading');
    pending.value = false;
  });
});
