import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RosterSummaryCard,
  rosterTakeaway,
  FocusAreasSummaryCard,
  countFocusAreas,
  focusAreasTakeaway,
} from './PlayersSummaryCard';
import type { NeedRow, RosterHealth } from './RosterHealthHeader';
import type { RosterRow } from './PlayersGridView';

function health(over: Partial<RosterHealth> = {}): RosterHealth {
  return {
    totalPlayers: 10,
    playersWithActive: 4,
    coverage: 0.4,
    activeAreas: 5,
    completedAreas: 2,
    playersWithRounds: 8,
    outcomeTally: { improved: 1, noChange: 1, worsened: 0 },
    totalOutcomes: 2,
    ...over,
  };
}

function need(id: string, priority: number): NeedRow {
  return { row: { player: { id } } as unknown as RosterRow, priority, reason: '' };
}

describe('rosterTakeaway', () => {
  it('never gives an all-clear when no rounds are logged', () => {
    expect(rosterTakeaway(health({ playersWithRounds: 0 }), [])).toMatch(/Nothing to assess yet/);
  });

  it('splits trending-down from uncoached players', () => {
    const line = rosterTakeaway(health(), [need('a', 3), need('b', 2), need('c', 1)]);
    expect(line).toBe('2 trending down, 2 without a focus area.');
  });

  it('frames a roster with no areas as a starting point', () => {
    const line = rosterTakeaway(health({ activeAreas: 0, completedAreas: 0 }), [need('a', 1)]);
    expect(line).toMatch(/ready for a first focus area/);
  });
});

describe('RosterSummaryCard', () => {
  it('shows the needs count, the takeaway and the coverage sample size', () => {
    render(<RosterSummaryCard health={health()} needs={[need('a', 1)]} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4 of 10 players with an active focus area.' })).toBeInTheDocument();
    expect(screen.getByText(/Roster · 10 players · 8 with rounds/)).toBeInTheDocument();
  });

  it('shows a dash, not a zero, when there is nothing to assess', () => {
    render(<RosterSummaryCard health={health({ playersWithRounds: 0 })} needs={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('focus areas summary', () => {
  const areas = [
    { player_id: 'a', status: 'active', outcome_status: 'improved' },
    { player_id: 'a', status: 'in_progress', outcome_status: null },
    { player_id: 'b', status: 'proposed', outcome_status: null },
    { player_id: 'b', status: 'completed', outcome_status: 'no_change' },
    { player_id: 'c', status: 'declined', outcome_status: null },
  ];

  it('splits status the way the board does and counts players', () => {
    const c = countFocusAreas(areas);
    expect(c).toMatchObject({ total: 5, active: 2, proposed: 1, completed: 1, declined: 1, players: 3, improved: 1, recorded: 2 });
  });

  it('names what is due, what is waiting and what landed', () => {
    const line = focusAreasTakeaway(countFocusAreas(areas), { due: 2, overdue: 1 }, null);
    expect(line).toBe("2 due for review (1 overdue); 1 awaiting the player's acceptance; 1 of 2 recorded outcomes improved.");
  });

  it('shows the active count, the status split and the sample size', () => {
    render(<FocusAreasSummaryCard counts={countFocusAreas(areas)} due={{ due: 0, overdue: 0 }} scopeName={null} />);
    expect(screen.getByText('Focus areas · 5 across 3 players')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2 active, 1 proposed, 1 completed, 1 declined, of 5 focus areas.' }),
    ).toBeInTheDocument();
  });

  it('shows a dash and a scoped empty line when a player has no areas', () => {
    render(<FocusAreasSummaryCard counts={countFocusAreas([])} due={{ due: 0, overdue: 0 }} scopeName="Jordan Lee" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No focus areas set for Jordan Lee yet.')).toBeInTheDocument();
  });
});
