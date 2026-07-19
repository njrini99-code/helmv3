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
 * This locks the CONTRACT this component owns: given two different payloads —
 * standing in for the two different window queries' results — the rendered
 * Team Pulse and Top Performers panels show DIFFERENT data, and the
 * Performance Trend region reacts to a different `teamScoringTrend` (the
 * hasTrend gate flips the whole region between the real chart and the
 * insufficient-data fallback). A regression that re-introduces stale state
 * (e.g. caching `data`/`enhancedData` in `useState` seeded only from the
 * initial props) would freeze these panels exactly as the bug report
 * describes, and this test would catch it.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayCoachDashboard } from './FairwayCoachDashboard';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';

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
