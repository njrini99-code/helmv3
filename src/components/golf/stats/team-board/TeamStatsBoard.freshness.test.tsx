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
import type { TeamPlayerStats } from '@/app/golf/(dashboard)/dashboard/stats/team/page';

/** A roster player with nothing recorded — enough to leave the zero-player
 *  branch so the populated masthead (and its verdict) renders. */
function player(overrides: Partial<TeamPlayerStats> = {}): TeamPlayerStats {
  return {
    id: 'p1',
    first_name: 'Avery',
    last_name: 'Lane',
    avatar_url: null,
    graduation_year: 2027,
    handicap: null,
    rounds_played: 3,
    scoring_average: 74.2,
    best_round: null,
    worst_round: null,
    fairway_pct: null,
    fairway_hits: 0,
    fairway_attempts: 0,
    gir_pct: null,
    gir_hits: 0,
    gir_attempts: 0,
    putts_per_round: null,
    total_putts: 0,
    holes_with_putts: 0,
    scrambling_pct: null,
    scrambles_made: 0,
    scramble_attempts: 0,
    birdies_per_round: null,
    total_birdies: 0,
    holes_with_score: 0,
    // Null, not zero: fewer than TREND_SIGNAL_MIN_ROUNDS rounds means no
    // signal has been computed, which is what the verdict has to say.
    scoring_trend: null,
    rounds_played_18: 3,
    rounds_played_9: 0,
    scoring_average_18: 74.2,
    scoring_average_9: null,
    best_round_18: null,
    best_round_9: null,
    ...overrides,
  };
}

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

  });

  // The gate used to be a standalone caption above the board and an
  // `InsufficientData` block inside the KPI band. It is now one clause of the
  // masthead verdict, so it only renders on the populated path.
  it('states the trend gate in the verdict once the roster is not empty', () => {
    render(
      <TeamStatsBoard
        teamName="Guilford College"
        players={[player()]}
        intelligenceByPlayer={{}}
        leakMaps={null}
        standingByPlayer={new Map()}
        teamRounds30d={0}
        freshness={freshness}
      />,
    );

    expect(screen.getByText(/trend signals begin after 8 completed rounds/i)).toBeVisible();
    // No strokes gained anywhere and no fetch failure: the cold start is a
    // real cold start and says so, rather than rendering an empty instrument.
    expect(screen.getAllByText(/strokes gained appears once players log rounds/i).length).toBeGreaterThan(0);
    // A trend count of zero must never render as an authoritative "0 climbing".
    expect(screen.queryByText(/0 climbing/i)).not.toBeInTheDocument();
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
