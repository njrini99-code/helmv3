import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

// The full raw-UTC freshness sentence now lives behind a Menu item
// (`fairwayToast.info`), not printed on the page — mock the same way
// ReportProblemButton.test.tsx does, so the "Freshness details" click can be
// asserted without a real `<Toaster>` mounted.
const toastInfoMock = vi.fn();
vi.mock('@/components/fairway/feedback/ToastStack', async () => {
  const actual = await vi.importActual<typeof import('@/components/fairway/feedback/ToastStack')>('@/components/fairway/feedback/ToastStack');
  return {
    ...actual,
    fairwayToast: { ...actual.fairwayToast, info: (...args: unknown[]) => toastInfoMock(...args), success: vi.fn(), danger: vi.fn(), warning: vi.fn() },
  };
});

import { TeamStatsBoard } from './TeamStatsBoard';

describe('TeamStatsBoard freshness', () => {
  beforeEach(() => {
    pushMock.mockReset();
    toastInfoMock.mockReset();
    // Fake only `Date` (matching date-picker-month-nav.test.tsx) — faking the
    // full timer suite would also need to drive userEvent's own internal
    // timers via its `advanceTimers` option.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-18T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const freshness = {
    roundRefreshMinutes: 5,
    statsCacheAsOf: '2026-08-18T16:00:00.000Z',
    statsCacheStale: true,
    standingAsOf: '2026-08-18T02:20:46.000Z',
    oldestSignalInsightAsOf: '2026-08-17T19:00:00.000Z',
  };

  it('shows ONE relative freshness line on the page, never raw UTC', () => {
    render(<TeamStatsBoard teamName="Guilford College" players={[]} intelligenceByPlayer={{}} leakMaps={null} standingByPlayer={new Map()} teamRounds30d={0} freshness={freshness} />);

    // ONE relative line — a coach reads none of four raw UTC timestamps in a
    // row (facelift REVIEW.md "Team stats, phone").
    expect(screen.getByText('Updated 2h ago')).toBeVisible();
    expect(screen.queryByText(/stats cache as of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rank snapshot as of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-08-18 16:00 utc/i)).not.toBeInTheDocument();

    expect(screen.getByText(/trend signals begin after 8 completed rounds/i)).toBeVisible();
  });

  it('navigates to CoachHelm chat from the overflow Menu', async () => {
    const user = userEvent.setup();
    render(<TeamStatsBoard teamName="Guilford College" players={[]} intelligenceByPlayer={{}} leakMaps={null} standingByPlayer={new Map()} teamRounds30d={0} freshness={freshness} />);

    // "Ask CoachHelm" lives inside the header's overflow Menu (facelift
    // §CONTAINERS TO REMOVE #1) rather than its own header pill — open it
    // first, matching how every other Fairway Menu test interacts with a
    // closed-by-default Radix dropdown (Menu.test.tsx). It's a `menuitem`
    // that navigates via `router.push` (not an anchor — see the useRouter
    // mock above), so the behavioral assertion is the push call, not an
    // href.
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /^ask coachhelm$/i }));
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/coachhelm/chat');
  });

  it('surfaces the full raw-UTC freshness detail behind the "Freshness details" Menu item', async () => {
    const user = userEvent.setup();
    render(<TeamStatsBoard teamName="Guilford College" players={[]} intelligenceByPlayer={{}} leakMaps={null} standingByPlayer={new Map()} teamRounds30d={0} freshness={freshness} />);

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /freshness details/i }));
    expect(toastInfoMock).toHaveBeenCalledWith(
      'Data freshness',
      expect.objectContaining({
        description: expect.stringMatching(/stats cache as of 2026-08-18 16:00 utc.*rank snapshot as of 2026-08-18 02:20 utc/i),
      }),
    );
  });
});
