import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamStatsBoard } from './TeamStatsBoard';

// "Ask CoachHelm" now navigates via `router.push` from a `Menu.Item`'s
// `onSelect` (see TeamStatsBoard.tsx — `Menu.Item asChild` can't wrap a bare
// `<Link>` here, matching the same useRouter mock FairwayCoachRoster.test.tsx
// uses for its own menu-driven navigation).
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/golf/dashboard/stats/team',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

describe('TeamStatsBoard freshness', () => {
  it('shows the source status for coach signal chips', async () => {
    const user = userEvent.setup();
    render(
      <TeamStatsBoard
        teamName="Guilford College"
        players={[]}
        intelligenceByPlayer={{}}
        leakMaps={null}
        standingByPlayer={new Map()}
        teamRounds30d={0}
        freshness={{
          roundRefreshMinutes: 5,
          statsCacheAsOf: '2026-08-18T16:00:00.000Z',
          statsCacheStale: true,
          standingAsOf: '2026-08-18T02:20:46.000Z',
          oldestSignalInsightAsOf: '2026-08-17T19:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText(/round results refresh within 5 min/i)).toBeVisible();
    expect(screen.getByText(/stats cache as of 2026-08-18 16:00 utc/i)).toBeVisible();
    expect(screen.getByText(/rank snapshot as of 2026-08-18 02:20 utc/i)).toBeVisible();
    expect(screen.getByText(/trend signals begin after 8 completed rounds/i)).toBeVisible();

    // "Ask CoachHelm" now lives inside the header's overflow Menu (facelift
    // §CONTAINERS TO REMOVE #1) rather than its own header pill — open it
    // first, matching how every other Fairway Menu test interacts with a
    // closed-by-default Radix dropdown (Menu.test.tsx). It's a `menuitem`
    // that navigates via `router.push` (not an anchor — see the useRouter
    // mock above), so the behavioral assertion is the push call, not an href.
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^ask coachhelm$/i }));
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/coachhelm/chat');
  });
});
