/**
 * GoalCard (W19) — render-state coverage.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GoalCard } from '@/components/golf/coachhelm/v3/GoalCard';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  const now = new Date();
  const ends = new Date(now.getTime() + 30 * 86400_000);
  return {
    id: 'goal-test-1',
    player_id: 'player-1',
    team_id: 'team-1',
    created_by_user_id: 'user-1',
    creator_role: 'player',
    coach_id_if_assigned: null,
    metric_id: 'putts_made_10_15ft_pct',
    title: 'Make more 10-15 ft putts',
    category: 'manual',
    started_at: now.toISOString(),
    ends_at: ends.toISOString(),
    window_days: 30,
    baseline_value: 30,
    current_value: 33,
    target_value: 36,
    target_source: 'midpoint',
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: false,
    shared_at: null,
    coach_assignment_mode: null,
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'manual',
    origin_insight_id: null,
    snapshots: [],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe('GoalCard', () => {
  it('renders title, metric label, baseline, current, target', () => {
    render(<GoalCard goal={makeGoal()} />);
    expect(screen.getByText('Make more 10-15 ft putts')).toBeTruthy();
    expect(screen.getByText(/Putts Made 10-15 ft/)).toBeTruthy();
    expect(screen.getByText(/Baseline 30%/)).toBeTruthy();
    expect(screen.getByText(/Now 33%/)).toBeTruthy();
    expect(screen.getByText(/Target 36%/)).toBeTruthy();
  });

  it('shows the right state chip per state', () => {
    const { rerender } = render(<GoalCard goal={makeGoal({ state: 'active' })} />);
    expect(screen.getByText('Active')).toBeTruthy();
    rerender(<GoalCard goal={makeGoal({ state: 'paused' })} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    rerender(<GoalCard goal={makeGoal({ state: 'achieved' })} />);
    expect(screen.getByText('Achieved')).toBeTruthy();
    rerender(<GoalCard goal={makeGoal({ state: 'missed' })} />);
    expect(screen.getByText('Missed')).toBeTruthy();
  });

  it('shows "Assigned by coach" footer for coach-assigned goals', () => {
    render(<GoalCard goal={makeGoal({ creator_role: 'coach', coach_id_if_assigned: 'c-1' })} />);
    expect(screen.getByText(/Assigned by coach/)).toBeTruthy();
  });

  it('shows "shared with coach" affordance for player-shared goals', () => {
    render(<GoalCard goal={makeGoal({ shared_with_coach: true })} />);
    expect(screen.getByText(/shared with coach/)).toBeTruthy();
  });

  it('renders compact mode as one-line', () => {
    render(<GoalCard goal={makeGoal()} expanded={false} />);
    expect(screen.getByTestId('goal-card-compact')).toBeTruthy();
    // Compact omits the baseline/target row
    expect(screen.queryByText(/Baseline/)).toBeNull();
  });

  it('shows em-dash placeholders when baseline / target are null', () => {
    render(
      <GoalCard
        goal={makeGoal({
          baseline_value: null,
          current_value: null,
          target_value: null,
        })}
      />,
    );
    // 3 em-dashes total (baseline / current / target)
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(3);
  });
});
