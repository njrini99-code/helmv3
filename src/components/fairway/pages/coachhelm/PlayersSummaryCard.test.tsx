import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RosterSummaryCard, rosterTakeaway } from './PlayersSummaryCard';
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
