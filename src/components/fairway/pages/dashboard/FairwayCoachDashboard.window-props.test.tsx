/**
 * ============================================================================
 * FairwayCoachDashboard — 7D/30D window threading (audit #54)
 * ----------------------------------------------------------------------------
 * The reported symptom: switching the coach dashboard's date-window Segmented
 * (7D/30D/...) appeared to leave the Performance Trend, Team Pulse, and Top
 * Performers panels pixel-identical. On this component, `data`/`enhancedData`
 * are consumed DIRECTLY from props on every render (no local state shadows
 * them, no memo drops a prop from its dependency array) — the actual per-
 * window query lives server-side in dashboard-data.ts (out of this packet's
 * file scope) and already scopes `teamScoringTrend` / `topPlayers` /
 * `teamPulse` to the selected `dateRange` via `dateCutoff`.
 *
 * This locks the TWO HALVES of the contract this component owns:
 *
 *   1. Given two different payloads — standing in for the two different
 *      window queries' results — the rendered Team Pulse and Top Performers
 *      panels show DIFFERENT data, and the Performance Trend region reacts to
 *      a different `teamScoringTrend` (the hasTrend gate flips the whole
 *      region between the real chart and the insufficient-data fallback). A
 *      regression that re-introduces stale state (e.g. caching
 *      `data`/`enhancedData` in `useState` seeded only from the initial
 *      props) would freeze these panels exactly as the bug report describes.
 *
 *   2. Clicking a DIFFERENT Segmented option threads a DISTINCT `?range=`
 *      value to `router.push` for each selection — the last-mile wiring this
 *      component owns before the (verified, out-of-file-scope) server-side
 *      `dateCutoff` refetch in dashboard-data.ts takes over. A regression
 *      that hardcodes the pushed URL, or reads a stale closed-over `range`
 *      instead of the just-clicked value, would push the SAME url for both
 *      7D and 30D — the exact "pixel-identical regardless of selection"
 *      symptom, one step earlier in the pipeline than half (1) covers.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FairwayCoachDashboard } from './FairwayCoachDashboard';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';

// Override the global `next/navigation` mock (src/test/setup.tsx) with a
// STABLE `push` spy shared across every `useRouter()` call in this file — the
// global mock returns a brand-new `push: vi.fn()` on every call, which would
// make it impossible to assert "two distinct pushes from the SAME router"
// across the re-renders a click triggers (each render would otherwise call
// `useRouter()` again and get a fresh, disconnected spy).
const mockPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

function baseData(overrides: Partial<CoachDashboardData> = {}): CoachDashboardData {
  return {
    coach: { id: 'coach-1', full_name: 'Pat Coach' } as CoachDashboardData['coach'],
    team: { id: 'team-1', name: 'Rini University', join_code: 'ABC123' } as CoachDashboardData['team'],
    stats: {
      rosterSize: 8,
      upcomingEvents: 0,
      activeQualifiers: 0,
      teamScoringAverage: 74,
    },
    recentRounds: [],
    topPlayers: [],
    calendarEvents: [],
    teamScoringTrend: undefined,
    ...overrides,
  };
}

function basePayload(overrides: Partial<CoachDashboardPayload> = {}): CoachDashboardPayload {
  return {
    todayEvents: [],
    todayScheduleError: false,
    stats: {
      rosterSize: 8,
      upcomingEvents: 0,
      activeQualifiers: 0,
      teamScoringAverage: 74,
      previousAverage: null,
    },
    sparklines: {
      scoringAvg: { label: 'Team Scoring Avg', value: 74, sparkline: [] },
      girPct: { label: 'Team GIR%', value: null, sparkline: [] },
      puttsPerRound: { label: 'Team Putts/Rd', value: null, sparkline: [] },
      rosterSize: { label: 'Roster Size', value: 8, sparkline: [] },
    },
    teamPulse: { improving: 0, stable: 0, declining: 0, roundsThisWeek: 0 },
    actionItems: [],
    recentRounds: [],
    topPlayers: [],
    teamScoringTrend: [],
    calendarEvents: [],
    teamName: 'Rini University',
    joinCode: 'ABC123',
    timezone: 'America/New_York',
    ...overrides,
  } as CoachDashboardPayload;
}

describe('FairwayCoachDashboard — window (7D/30D) props actually drive the render', () => {
  it('Team Pulse renders different improving/stable/declining counts for two different window payloads', () => {
    const sevenDay = basePayload({ teamPulse: { improving: 1, stable: 5, declining: 1, roundsThisWeek: 4 } });
    const thirtyDay = basePayload({ teamPulse: { improving: 6, stable: 2, declining: 0, roundsThisWeek: 22 } });

    const { unmount } = render(<FairwayCoachDashboard data={baseData()} enhancedData={sevenDay} joinRequests={[]} />);
    expect(screen.getByText('4 this week')).toBeInTheDocument();
    unmount();

    render(<FairwayCoachDashboard data={baseData()} enhancedData={thirtyDay} joinRequests={[]} />);
    expect(screen.getByText('22 this week')).toBeInTheDocument();
    expect(screen.queryByText('4 this week')).not.toBeInTheDocument();
  });

  it('Top Performers renders a different leaderboard for two different window payloads', () => {
    const sevenDay = baseData({
      topPlayers: [{ id: 'p1', name: 'Sam Sevener', avg_score: 71.2, rounds: 2 }],
    });
    const thirtyDay = baseData({
      topPlayers: [{ id: 'p2', name: 'Alex Thirtier', avg_score: 73.8, rounds: 9 }],
    });

    const { unmount } = render(<FairwayCoachDashboard data={sevenDay} enhancedData={basePayload()} joinRequests={[]} />);
    expect(screen.getByText('Sam Sevener')).toBeInTheDocument();
    expect(screen.queryByText('Alex Thirtier')).not.toBeInTheDocument();
    unmount();

    render(<FairwayCoachDashboard data={thirtyDay} enhancedData={basePayload()} joinRequests={[]} />);
    expect(screen.getByText('Alex Thirtier')).toBeInTheDocument();
    expect(screen.queryByText('Sam Sevener')).not.toBeInTheDocument();
  });

  it('Performance Trend region reacts to a different teamScoringTrend (insufficient-data vs a real trend)', () => {
    // A single-point trend (typical of a narrow 7D window with one round) is
    // below the `>= 2` gate — this component renders its own synchronous
    // insufficient-data fallback here (no chart to await).
    const oneMonthOfData = baseData({ teamScoringTrend: [{ label: 'Jul 26', value: 76 }] });
    const { unmount } = render(<FairwayCoachDashboard data={oneMonthOfData} enhancedData={basePayload()} joinRequests={[]} />);
    expect(screen.getByText('Trend appears as rounds build')).toBeInTheDocument();
    unmount();

    // A wider window's 2+ month trend clears the gate and swaps the whole
    // region to the real chart — the fallback copy must be gone.
    const threeMonthsOfData = baseData({
      teamScoringTrend: [
        { label: 'May 26', value: 78 },
        { label: 'Jun 26', value: 76 },
        { label: 'Jul 26', value: 74 },
      ],
    });
    render(<FairwayCoachDashboard data={threeMonthsOfData} enhancedData={basePayload()} joinRequests={[]} />);
    expect(screen.queryByText('Trend appears as rounds build')).not.toBeInTheDocument();
  });
});

describe('FairwayCoachDashboard — clicking the window Segmented threads a DISTINCT range to the URL (audit #54)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('pushes a genuinely different ?range= for 7D than for 30D (not the same url twice)', async () => {
    const user = userEvent.setup();
    render(
      <FairwayCoachDashboard
        data={baseData()}
        enhancedData={basePayload()}
        dateRange="all"
        joinRequests={[]}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '7D' }));
    expect(mockPush).toHaveBeenLastCalledWith('/golf/dashboard?range=7d');

    await user.click(screen.getByRole('radio', { name: '30D' }));
    expect(mockPush).toHaveBeenLastCalledWith('/golf/dashboard?range=30d');

    // The two pushes must be genuinely distinct calls/args — a regression
    // that re-pushes the SAME range regardless of which segment was clicked
    // (e.g. a stale closed-over `range` instead of the just-clicked value)
    // would reproduce "pixel-identical regardless of selection" one step
    // upstream of the props-driven-render contract locked in above: this
    // component would never even ASK the server for the other window's data.
    const calls = mockPush.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['/golf/dashboard?range=7d', '/golf/dashboard?range=30d']);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it('pushes the bare route (no ?range=) when switching back to All', async () => {
    const user = userEvent.setup();
    render(
      <FairwayCoachDashboard
        data={baseData()}
        enhancedData={basePayload()}
        dateRange="30d"
        joinRequests={[]}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(mockPush).toHaveBeenLastCalledWith('/golf/dashboard');
  });
});
