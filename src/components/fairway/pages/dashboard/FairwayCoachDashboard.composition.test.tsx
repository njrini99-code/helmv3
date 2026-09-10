/**
 * ============================================================================
 * FairwayCoachDashboard — facelift composition (coach-home.md, REVIEW.md
 * home-polish/24-25)
 * ----------------------------------------------------------------------------
 * Locks the structural fact the facelift pass exists to deliver: a 7/5
 * asymmetric grid with Today as the dominant object, never the twelve-card
 * stack it replaced. Queries by accessible name (`role="region"` via
 * `aria-label`), not by class name or DOM position alone, so the assertion
 * survives a pure styling/token change but still catches a regression that
 * reorders the sections or drops one of them.
 *
 * UPDATED (review coach-home/24-25): the original composition ran Today |
 * Team performance and Team pulse | Latest as TWO stacked CSS grid rows. A
 * shared grid row stretches its shorter column to match the taller one, so
 * a short Today card left a ~340px blank hole under it while Team
 * performance ran long beside it, and "who needs attention" (Team pulse)
 * could never start until the whole first row — including the taller stats
 * panel — finished. The fix folds Today, Team pulse, Recent rounds and
 * Latest into ONE independent-height left rail (an "operations stack"),
 * leaving Team performance as the single item in the right column of ONE
 * grid (`items-start`, no row-stretch). DOM order is now column-major
 * (the whole left rail, then Team performance) rather than row-major.
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
    teamPulse: { improving: 2, stable: 1, declining: 0, roundsThisWeek: 3 },
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

describe('FairwayCoachDashboard — 7/5 asymmetric grid (coach-home.md, review coach-home/24-25)', () => {
  it('renders Today, Team pulse, Recent rounds and Team performance as named regions, with the whole left rail ahead of Team performance in DOM order', () => {
    render(
      <FairwayCoachDashboard
        data={baseData({
          topPlayers: [{ id: 'p1', name: 'Alex Player', avg_score: 72.5, rounds: 5 }],
        })}
        enhancedData={basePayload()}
        joinRequests={[]}
      />,
    );

    // The four aria-labelled regions the 7/5 composition requires — a
    // regression that drops or renames one of these fails here first.
    const today = screen.getByRole('region', { name: "Today's schedule" });
    const teamPulse = screen.getByRole('region', { name: 'Team pulse' });
    const recentRounds = screen.getByRole('region', { name: 'Recent rounds' });
    const teamPerformance = screen.getByRole('region', { name: 'Team performance' });

    // Today is the dominant object (SCREEN "Dominant object" — coach-home.md)
    // and the first thing in the left rail — it must precede everything else.
    expect(today.compareDocumentPosition(teamPulse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(today.compareDocumentPosition(recentRounds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(today.compareDocumentPosition(teamPerformance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The left rail is itself ordered Today → Team pulse ("who needs
    // attention") → Recent rounds, top to bottom.
    expect(teamPulse.compareDocumentPosition(recentRounds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Team performance is the lone item in the right column — it renders
    // AFTER the entire left rail (review coach-home/24-25: this is now one
    // grid with two independent-height columns, not a row-locked 2x2 that
    // stretched Today to match Team performance's height and delayed the
    // attention board until that whole row finished).
    expect(recentRounds.compareDocumentPosition(teamPerformance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never renders the removed containers: no page-level Window band, no MetricCard KPI grid, no separate Schedule/Performance Trend/Top Performers cards', () => {
    render(
      <FairwayCoachDashboard
        data={baseData({
          topPlayers: [{ id: 'p1', name: 'Alex Player', avg_score: 72.5, rounds: 5 }],
        })}
        enhancedData={basePayload()}
        joinRequests={[]}
      />,
    );

    // The old page-level "WINDOW" eyebrow band (CONTAINERS TO REMOVE #2) is
    // gone — the Segmented now lives inside Team performance's own header.
    expect(screen.queryByText('Window')).not.toBeInTheDocument();
    // The old standalone "Schedule" card and "Top Performers" card heading
    // (CONTAINERS TO REMOVE #4/#5) are gone — merged into Today and Team
    // pulse respectively. (The Performance Trend chart itself keeps its own
    // <h3> title — it just no longer owns a separate top-level card; that's
    // covered by the region-order assertion above, which finds it nested
    // inside "Team performance".)
    expect(screen.queryByRole('heading', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Top Performers' })).not.toBeInTheDocument();
  });
});
