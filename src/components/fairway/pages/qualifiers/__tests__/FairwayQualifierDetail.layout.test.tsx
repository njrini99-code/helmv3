/**
 * The redesigned Qualifier Detail against the production qualifiers:
 *   · the title without its " — suffix", the start date only;
 *   · the status card holds the server's scorecard count while the feed loads
 *     (no "0" flash), then reads the feed: "Round 3 of 3 up next", 14 of 21;
 *   · every player's rounds played as dots, from the same feed as the board;
 *   · a completed qualifier scored straight onto its entries (487f30a2) says
 *     it has no per-round breakdown instead of "no rounds were recorded";
 *   · blank rules and a missing deadline are left out.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const mockUseQualifierRealtime = vi.fn();

vi.mock('@/hooks/golf/use-qualifier-realtime', () => ({
  useQualifierRealtime: (...args: unknown[]) => mockUseQualifierRealtime(...args),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { selection_state: 'open' } }),
        }),
      }),
    }),
  }),
}));

import { FairwayQualifierDetail, type FairwayQualifierDetailProps } from '../FairwayQualifierDetail';

function feedEntry(player_name: string, rounds_completed: number, total_score: number, total_to_par: number) {
  return {
    id: `e-${player_name}`,
    qualifier_id: 'q1',
    player_id: player_name.toLowerCase().replace(/\s+/g, '-'),
    player_name,
    position: null,
    score: total_score,
    total_score,
    total_to_par,
    rounds_completed,
    is_tied: false,
    status: 'registered',
    notes: null,
    round_id: null,
    created_at: null,
    updated_at: null,
  };
}

// 86dad12b "Fall Invitational Qualifier": 3 rounds, 2 played by all 7.
const FALL_INVITATIONAL = [
  feedEntry('Cole Bennett', 2, 141, -3),
  feedEntry('Mason Rivers', 2, 144, 0),
  feedEntry('Owen Carter', 2, 145, 1),
  feedEntry('Ethan Park', 2, 146, 2),
  feedEntry('Jackson Hale', 2, 147, 3),
  feedEntry('Dylan Brooks', 2, 150, 6),
  feedEntry('Tyler Hayes', 2, 155, 11),
];

// 487f30a2 "Fall Qualifier — Travel Team Selection": 1 round, totals keyed
// onto the entries, no linked golf_rounds.
const TRAVEL_TEAM = [
  feedEntry('Cole Bennett', 1, 70, -2),
  feedEntry('Dylan Brooks', 1, 72, 0),
  feedEntry('Mason Rivers', 1, 73, 1),
  feedEntry('Jackson Hale', 1, 75, 3),
  feedEntry('Ethan Park', 1, 76, 4),
  feedEntry('Tyler Hayes', 1, 78, 6),
];

function props(overrides: Partial<FairwayQualifierDetailProps> = {}): FairwayQualifierDetailProps {
  return {
    qualifierId: '86dad12b-d9e4-4d24-9d0b-8ca455634c64',
    isCoach: true,
    isPlayer: false,
    name: 'Fall Invitational Qualifier',
    status: 'in_progress',
    startDate: '2026-09-25',
    endDate: '2026-09-29',
    entryDeadline: null,
    courseName: 'Home course',
    spotsAvailable: 5,
    rules: '',
    entrantCount: 7,
    roundsSubmitted: 14,
    canPlayRound: false,
    breakdown: [],
    maxRoundNumber: 0,
    numRounds: 3,
    roundCourses: [],
    selectionState: 'scoring',
    selectionSlotsTotal: 5,
    selectionSlotsCoachPick: 1,
    selectionsCount: 0,
    ...overrides,
  };
}

describe('FairwayQualifierDetail — layout and data', () => {
  it('holds the server scorecard count while the feed loads', () => {
    mockUseQualifierRealtime.mockReturnValue({ leaderboard: [], qualifier: null, loading: true, error: null });
    render(<FairwayQualifierDetail {...props()} />);
    expect(screen.getByTestId('qualifier-cards-in')).toHaveTextContent(/^14\s*of 21 scorecards in$/);
    // The dots wait for the feed rather than guess.
    expect(screen.getByRole('status', { name: 'Loading rounds played' })).toBeInTheDocument();
  });

  it('shows the title without its suffix and the start date only', () => {
    mockUseQualifierRealtime.mockReturnValue({ leaderboard: FALL_INVITATIONAL, qualifier: { status: 'in_progress' }, loading: false, error: null });
    render(<FairwayQualifierDetail {...props({ name: 'Fall Qualifier — Travel Team Selection' })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Fall Qualifier$/);
    expect(screen.getAllByText('Sep 25, 2026').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sep 29/)).toBeNull();
  });

  it('reads the Fall Invitational from the feed: round 3 up next, 14 of 21, dots at 2 of 3', () => {
    mockUseQualifierRealtime.mockReturnValue({ leaderboard: FALL_INVITATIONAL, qualifier: { status: 'in_progress' }, loading: false, error: null });
    render(<FairwayQualifierDetail {...props()} />);

    const status = screen.getByLabelText('Where it stands');
    expect(status).toHaveTextContent('Round 3 of 3 up next');
    expect(within(status).getByTestId('qualifier-cards-in')).toHaveTextContent(/^14\s*of 21 scorecards in$/);
    expect(status).toHaveTextContent('Cole Bennett leads by 3 shots');

    const played = screen.getByRole('region', { name: 'Rounds played' });
    const rows = within(played).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row).toHaveTextContent('2 of 3 rounds played');
    expect(rows[0]).toHaveTextContent('Cole Bennett');

    // Blank rules and a null deadline are left out, not dashed.
    const details = screen.getByLabelText('Qualifier details');
    expect(within(details).queryByText('Rules')).toBeNull();
    expect(within(details).queryByText('Entry deadline')).toBeNull();
    expect(details).toHaveTextContent('Start date');
    expect(details).toHaveTextContent('4 on score · 1 coach\'s pick');
  });

  it('says a qualifier scored onto its entries has no per-round breakdown', () => {
    mockUseQualifierRealtime.mockReturnValue({ leaderboard: TRAVEL_TEAM, qualifier: { status: 'completed' }, loading: false, error: null });
    render(
      <FairwayQualifierDetail
        {...props({
          qualifierId: '487f30a2-7794-4ae7-a81f-752c90daab2f',
          name: 'Fall Qualifier — Travel Team Selection',
          status: 'completed',
          startDate: '2026-06-16',
          endDate: '2026-06-16',
          courseName: 'Demo University Home Course',
          rules: '18-hole stroke play. Gold tees. No caddies. Ties broken by scorecard playoff (holes 1, 2, 3).',
          entrantCount: 6,
          roundsSubmitted: 0,
          numRounds: 1,
          selectionState: 'selected',
          breakdown: TRAVEL_TEAM.map((e) => [e.player_id, { playerName: e.player_name, rounds: [], totalScore: 0, totalToPar: 0 }]),
        })}
      />,
    );

    expect(screen.getByText('No per-round breakdown')).toBeInTheDocument();
    expect(screen.queryByText('Completed: no rounds were recorded')).toBeNull();

    const status = screen.getByLabelText('Where it stands');
    expect(status).toHaveTextContent('Final standings');
    expect(within(status).getByTestId('qualifier-cards-in')).toHaveTextContent(/^6\s*of 6 scorecards in$/);
    expect(status).toHaveTextContent('Cole Bennett finished first, 2 shots clear');

    const played = screen.getByRole('region', { name: 'Rounds played' });
    for (const row of within(played).getAllByRole('listitem')) expect(row).toHaveTextContent('1 of 1 round played');
    expect(screen.getByLabelText('Qualifier details')).toHaveTextContent('Ties broken by scorecard playoff');
  });

  it('gives a closed qualifier with nothing posted one honest line, not hollow rows', () => {
    mockUseQualifierRealtime.mockReturnValue({
      leaderboard: ['Owen Carter', 'Tyler Hayes'].map((n) => feedEntry(n, 0, 0, 0)),
      qualifier: { status: 'completed' },
      loading: false,
      error: null,
    });
    render(<FairwayQualifierDetail {...props({ status: 'completed', numRounds: 1, entrantCount: 2, roundsSubmitted: 0 })} />);
    const played = screen.getByRole('region', { name: 'Rounds played' });
    expect(within(played).queryAllByRole('listitem')).toHaveLength(0);
    expect(played).toHaveTextContent('No rounds were posted before this qualifier closed.');
    expect(screen.getByLabelText('Where it stands')).toHaveTextContent('Closed with no rounds posted');
  });
});
