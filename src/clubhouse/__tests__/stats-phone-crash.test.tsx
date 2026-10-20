import './dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * A malformed team-figures list crashes the phone's figures section (CH-4204), not the page: the hero looked its figure
 * up while the page built its props, outside the boundary, so /stats?state=crash answered 500 on the phone (overnight
 * dark a11y scan, 2026-10-15).
 */
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/stats', useSearchParams: () => new URLSearchParams() }));

import { StatsTeamPhone } from '../screens/stats/StatsTeamPhone';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

describe('the phone team stats keep a broken figures list to its own section', () => {
  it('renders the page with the figures section\'s notice instead of throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <StatsTeamPhone data={{ ...PREVIEW_TEAM_STATS, figures: null as never }} />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    expect(screen.getByText('Team figures couldn’t be shown')).toBeInTheDocument();
  });
});
