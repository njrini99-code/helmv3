/**
 * The synthesized Team signals must not be double-counted by the roll-ups.
 *
 * `synthesizeTeamSignals` (77c49aec8) fills the previously-empty `__team__`
 * bucket by SUMMING each metric's |strokes_impact| across the roster. Those
 * rows then flow into `groupSignals` alongside the per-player rows they were
 * computed from.
 *
 * `TeamSignalSummary` flattens `groups.flatMap(g => g.signals)` — which
 * INCLUDES the team bucket — and sums `strokeImpact` for its "est. strokes"
 * badge. So every leak is counted twice: once on the player it belongs to, and
 * again inside the roster total synthesized from it. The "N live" badge is
 * inflated the same way, by rows that are a roll-up rather than a finding.
 *
 * A derived total is not a new signal. It must be visible in the Team bucket
 * and invisible to anything that AGGREGATES, which is why it needs its own
 * `kind` rather than passing as an ordinary insight.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamSignalSummary } from '../TeamSignalSummary';
import { groupSignals, type GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { synthesizeTeamSignals } from '@/lib/coachhelm/v3/insights/team-synthesis';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => new URLSearchParams(),
}));

function sig(playerId: string, metric: string, impact: number): GroupedSignal {
  return {
    id: `${playerId}:${metric}`,
    kind: 'insight',
    category: metric,
    severity: 'high',
    title: `${metric} leak`,
    claim: 'A leak.',
    ageDays: 4,
    status: 'active',
    strokeImpact: impact,
    playerId,
    supersededCount: 0,
    evidence: { metric, metric_label: 'Putts Made 3-5 ft' },
  };
}

describe('TeamSignalSummary — synthesized team rows are a roll-up, not a finding', () => {
  it('does not add the synthesized roster total on top of the leaks it came from', () => {
    const perPlayer = [
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ];
    const team = synthesizeTeamSignals(perPlayer);
    // Guard the premise: the synthesis really did produce a 4.5-stroke roll-up.
    expect(team).toHaveLength(1);
    expect(team[0]!.strokeImpact).toBeCloseTo(4.5, 5);

    const groups = groupSignals([...perPlayer, ...team], {
      p1: 'A', p2: 'B', p3: 'C',
    });

    render(<TeamSignalSummary groups={groups} playerHref={(id) => `/golf/dashboard/players/${id}`} onOpenPlayer={vi.fn()} />);

    // The honest total is the three real leaks: 4.5. Counting the roll-up too
    // would read 9.0.
    expect(screen.getByText('4.5 est. strokes')).toBeInTheDocument();
    expect(screen.queryByText('9.0 est. strokes')).toBeNull();
  });

  it('does not count a roll-up row toward the live-signal count', () => {
    const perPlayer = [
      sig('p1', 'putts_made_3_5ft_pct', 2.0),
      sig('p2', 'putts_made_3_5ft_pct', 1.5),
      sig('p3', 'putts_made_3_5ft_pct', 1.0),
    ];
    const groups = groupSignals(
      [...perPlayer, ...synthesizeTeamSignals(perPlayer)],
      { p1: 'A', p2: 'B', p3: 'C' },
    );

    render(<TeamSignalSummary groups={groups} playerHref={(id) => `/golf/dashboard/players/${id}`} onOpenPlayer={vi.fn()} />);

    expect(screen.getByText('3 live')).toBeInTheDocument();
    expect(screen.queryByText('4 live')).toBeNull();
  });
});
