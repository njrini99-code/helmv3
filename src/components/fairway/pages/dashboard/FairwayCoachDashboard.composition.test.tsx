/**
 * FairwayCoachDashboard composition (docs/design/fairway-facelift/LANGUAGE.md).
 * The home is a field sheet: masthead with the verdict, the Score field
 * stage, the ledger row (Today, Attention, Latest), then the recent rounds
 * table. These tests pin the anatomy and the retirement of the old tiles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FairwayCoachDashboard } from './FairwayCoachDashboard';
import type { CoachDashboardData } from '@/app/golf/(dashboard)/dashboard/components/coach-dashboard-types';
import type { CoachDashboardPayload } from '@/app/golf/actions/dashboard-data';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

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

function round(id: string, playerId: string, name: string, date: string, score: number, toPar: number): CoachDashboardData['recentRounds'][number] {
  return {
    id,
    player_id: playerId,
    player_name: name,
    player_avatar_url: null,
    course_name: 'pebble beach',
    total_score: score,
    total_to_par: toPar,
    round_date: date,
    round_type: 'qualifier',
    total_putts: 30,
    total_fairways_hit: 8,
    total_fairways: 14,
    total_gir: 11,
    total_gir_possible: 18,
  };
}

const ROUNDS = [
  round('r1', 'p1', 'Alex Player', '2026-08-01', 71, -1),
  round('r2', 'p1', 'Alex Player', '2026-08-10', 75, 3),
  round('r3', 'p2', 'Sam Second', '2026-08-12', 78, 6),
];

function baseData(overrides: Partial<CoachDashboardData> = {}): CoachDashboardData {
  return {
    coach: { id: 'coach-1', full_name: 'Pat Coach' } as CoachDashboardData['coach'],
    team: { id: 'team-1', name: 'Rini University', join_code: 'ABC123' } as CoachDashboardData['team'],
    stats: { rosterSize: 3, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: 74 },
    recentRounds: ROUNDS,
    topPlayers: [
      { id: 'p1', name: 'Alex Player', avg_score: 73, rounds: 2 },
      { id: 'p2', name: 'Sam Second', avg_score: 78, rounds: 1 },
    ],
    calendarEvents: [],
    teamScoringTrend: undefined,
    ...overrides,
  };
}

function basePayload(overrides: Partial<CoachDashboardPayload> = {}): CoachDashboardPayload {
  return {
    todayEvents: [],
    todayScheduleError: false,
    teamStatsUnavailable: false,
    stats: { rosterSize: 3, upcomingEvents: 0, activeQualifiers: 0, teamScoringAverage: 74, previousAverage: null },
    sparklines: {
      scoringAvg: { label: 'Team Scoring Avg', value: 74.6, sparkline: [76, 75, 74, 74, 73] },
      girPct: { label: 'Team GIR%', value: 61.1, sparkline: [55, 60, 61, 64, 66], suffix: '%' },
      puttsPerRound: { label: 'Team Putts/Rd', value: 31.4, sparkline: [] },
      rosterSize: { label: 'Roster Size', value: 3, sparkline: [] },
    },
    teamSeries: {
      scoringAvg: [76.2, 75.1, 74.6],
      girPct: [55.4, 60.2, 61.1],
      puttsPerRound: [],
      roundsInWindow: 12,
    },
    teamPulse: { improving: 1, stable: 1, declining: 1, roundsThisWeek: 2 },
    actionItems: [],
    recentRounds: [],
    topPlayers: [],
    teamScoringTrend: [],
    calendarEvents: [],
    teamName: 'Rini University',
    joinCode: 'ABC123',
    timezone: 'America/New_York',
    roster: [
      { id: 'p1', name: 'Alex Player', avatar_url: null },
      { id: 'p2', name: 'Sam Second', avatar_url: null },
      { id: 'p3', name: 'Quiet Third', avatar_url: null },
    ],
    windowStart: null,
    today: '2026-09-10',
    ...overrides,
  };
}

describe('FairwayCoachDashboard, the field sheet composition', () => {
  it('renders the verdict, the Score field stage, Today, Attention, Latest and Recent rounds, in that DOM order', () => {
    render(<FairwayCoachDashboard data={baseData()} enhancedData={basePayload()} joinRequests={[]} greeting="Good morning" todayLabel="Thursday, September 10" />);

    const stage = screen.getByRole('region', { name: 'Score field' });
    const today = screen.getByRole('region', { name: "Today's schedule" });
    const attention = screen.getByRole('region', { name: 'Who needs attention' });
    const rounds = screen.getByRole('region', { name: 'Recent rounds' });
    const verdict = document.querySelector('[data-slot="verdict"]');
    expect(verdict).not.toBeNull();

    const order = [verdict!, stage, today, attention, rounds];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Pat.');
  });

  it('draws one Score field row per roster player, with a bar per round and a note for a player without rounds', () => {
    render(<FairwayCoachDashboard data={baseData()} enhancedData={basePayload()} joinRequests={[]} />);
    const field = screen.getByRole('table', { name: /rounds by player/i });
    const rows = within(field).getAllByRole('row').filter((r) => within(r).queryByRole('rowheader'));
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['APAlex Player', 'SSSam Second', 'QTQuiet Third']);
    expect(within(rows[0]!).getAllByRole('link', { name: /Pebble Beach/ })).toHaveLength(2);
    expect(within(rows[2]!).getByText('No rounds in this window')).toBeInTheDocument();
    expect(within(field).getByText('Today')).toBeInTheDocument();
  });

  it('puts the team readouts inside the stage and the leader in the verdict', () => {
    render(<FairwayCoachDashboard data={baseData()} enhancedData={basePayload()} joinRequests={[]} />);
    const stage = screen.getByRole('region', { name: 'Score field' });
    expect(within(stage).getByText('Scoring avg')).toBeInTheDocument();
    expect(within(stage).getByText('74.6')).toBeInTheDocument();
    expect(within(stage).getByText('61.1')).toBeInTheDocument();
    const verdict = document.querySelector('[data-slot="verdict"]')!;
    expect(verdict).toHaveTextContent('Alex Player leads at 73.0.');
    expect(within(verdict as HTMLElement).getByRole('link', { name: 'Alex Player' })).toHaveAttribute('href', '/golf/dashboard/roster/p1');
  });

  it('renders the recent rounds as a table with signed to-par ink and never the retired tiles', () => {
    render(<FairwayCoachDashboard data={baseData()} enhancedData={basePayload()} joinRequests={[]} />);
    const rounds = screen.getByRole('region', { name: 'Recent rounds' });
    const table = within(rounds).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + ROUNDS.length);
    expect(within(table).getByText('+6')).toBeInTheDocument();
    expect(within(table).getByText('−1')).toBeInTheDocument();

    expect(screen.queryByText('Team performance')).not.toBeInTheDocument();
    expect(screen.queryByText('Performance Trend')).not.toBeInTheDocument();
    expect(screen.queryByText('Team pulse')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="ticker-strip"]')).toBeNull();
    expect(document.querySelector('[data-slot="metric-card"]')).toBeNull();
  });

  it('keeps the honest empty state when the window has no rounds and offers the wider window', () => {
    render(<FairwayCoachDashboard data={baseData({ recentRounds: [] })} enhancedData={basePayload({ windowStart: '2026-09-03' })} dateRange="7d" joinRequests={[]} />);
    const stage = screen.getByRole('region', { name: 'Score field' });
    expect(within(stage).getByText('No rounds in this window')).toBeInTheDocument();
    expect(within(stage).getByRole('button', { name: 'Show all time' })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="verdict"]')).toHaveTextContent('No rounds in this window.');
  });

  it('captions a readout delta with the span it was actually measured across', () => {
    render(<FairwayCoachDashboard data={baseData()} enhancedData={basePayload()} joinRequests={[]} />);
    // The series under the readouts is teamSeries (window buckets), not the
    // five-individual-round sparkline. The caption must name the real span so
    // the arrow cannot be read as "the team moved this much in five rounds".
    // Scoring and GIR both have a bucketed series, so both caption the span;
    // putts has none and prints nothing rather than a bare arrow.
    expect(screen.getAllByText(/across 12 rounds/i).length).toBe(2);
    expect(screen.queryByText(/last 5 rounds/i)).not.toBeInTheDocument();
  });
});
