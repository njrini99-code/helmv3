/**
 * ============================================================================
 * FairwayCoachDashboard — the cockpit composition (home.v2.md)
 * ----------------------------------------------------------------------------
 * Locks the structural fact THIS pass exists to deliver: Today and Who-needs-
 * attention share one operations row, Team performance is promoted to its
 * own full-width instrument band BELOW that row (not beside Today anymore —
 * that repositioning is the direct fix for the nested-card / 340px-hole
 * defects REVIEW.md flagged on this exact screen), and the ledger row
 * (Recent rounds | Activity) comes last. Queries by accessible name
 * (`role="region"` via `aria-label`), not by class name or DOM position
 * alone, so the assertion survives a pure styling/token change but still
 * catches a regression that reorders the sections or drops one of them.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayCoachDashboard } from './FairwayCoachDashboard';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

// The Activity section (`NotificationsLatestModule`, `frame="bare"`) self-
// fetches and renders NOTHING while loading or genuinely empty — the DOM-
// order assertion below needs it to actually mount its region, so this
// resolves one item rather than leaving the real server action to run
// (and fail, silently, the same honest way) in a unit test.
vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getUnifiedNotifications: vi.fn(async () => ({
    success: true,
    data: {
      items: [
        {
          id: 'n1',
          source: 'notifications',
          category: 'messages',
          title: 'Jordan Lee sent a message',
          body: 'See you at practice',
          action_url: null,
          created_at: '2026-09-01T15:00:00.000Z',
          read_at: null,
        } as UnifiedNotificationItem,
      ],
    },
  })),
  markNotificationRead: vi.fn(async () => ({ success: true })),
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
  } as CoachDashboardData;
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

describe('FairwayCoachDashboard — home.v2.md composition', () => {
  it('renders Today, Who needs attention, Team performance, Recent rounds and Latest notifications as named regions, in that DOM order', async () => {
    render(
      <FairwayCoachDashboard
        data={baseData({
          topPlayers: [{ id: 'p1', name: 'Alex Player', avg_score: 72.5, rounds: 5 }],
        })}
        enhancedData={basePayload()}
        joinRequests={[]}
      />,
    );

    const today = screen.getByRole('region', { name: "Today's schedule" });
    const whoNeedsAttention = screen.getByRole('region', { name: 'Who needs attention' });
    const teamPerformance = screen.getByRole('region', { name: 'Team performance' });
    const recentRounds = screen.getByRole('region', { name: 'Recent rounds' });
    // Async: NotificationsLatestModule self-fetches before it mounts its region.
    const latestNotifications = await screen.findByRole('region', { name: 'Latest notifications' });

    // Operations row (home.v2.md §4): Today precedes Who-needs-attention,
    // same row, left-to-right reading order.
    expect(today.compareDocumentPosition(whoNeedsAttention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Instrument band (home.v2.md §5): the operations row precedes the
    // full-width Team performance cockpit — it is no longer a column
    // beside Today, it is its own row below both operations-row columns.
    expect(whoNeedsAttention.compareDocumentPosition(teamPerformance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Ledger row (home.v2.md §6): the instrument band precedes Recent
    // rounds, which precedes Activity — same row, left-to-right.
    expect(teamPerformance.compareDocumentPosition(recentRounds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recentRounds.compareDocumentPosition(latestNotifications) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('never renders the removed containers, and the "Team pulse" name is fully retired', () => {
    render(
      <FairwayCoachDashboard
        data={baseData({
          topPlayers: [{ id: 'p1', name: 'Alex Player', avg_score: 72.5, rounds: 5 }],
        })}
        enhancedData={basePayload()}
        joinRequests={[]}
      />,
    );

    // The old page-level "WINDOW" eyebrow band is gone — the range control
    // now lives in the sticky Toolbar (Segmented on desktop, a Menu on
    // phone), not a standalone page-level band.
    expect(screen.queryByText('Window')).not.toBeInTheDocument();
    // The old standalone "Schedule" card and "Top Performers" card heading
    // are gone — merged into Today and Who-needs-attention respectively.
    expect(screen.queryByRole('heading', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Top Performers' })).not.toBeInTheDocument();
    // The section drifted to "Team pulse" in the shipped code; home.v2.md
    // corrects it back to "Who needs attention" — no heading OR region
    // should still carry the old name.
    expect(screen.queryByRole('heading', { name: 'Team pulse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Team pulse' })).not.toBeInTheDocument();
  });

  it('renders the verdict line and the sticky toolbar', () => {
    render(
      <FairwayCoachDashboard
        data={baseData({
          topPlayers: [{ id: 'p1', name: 'Alex Player', avg_score: 72.5, rounds: 5 }],
        })}
        enhancedData={basePayload({
          todayEvents: [
            {
              id: 'e1',
              title: 'Practice',
              event_type: 'practice',
              start_time: '2026-09-10T14:00:00.000Z',
              end_time: '2026-09-10T15:00:00.000Z',
              location: null,
            },
          ],
        })}
        joinRequests={[]}
      />,
    );

    // "1 event on today's schedule." — singular, and the pulse clause
    // (2 improving, 0 declining — `tracked` = improving+stable+declining =
    // 3 > 0) both present in one sentence.
    expect(screen.getByText(/event on today's schedule\./)).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Dashboard toolbar' })).toBeInTheDocument();
  });
});
