// @vitest-environment jsdom
/**
 * ============================================================================
 * SignalDossier — related-context fill (Wave 2 dead-space fix)
 * ----------------------------------------------------------------------------
 * Live-QA: the dossier's right pane left ~700-800px of blank canvas below
 * the action row while the queue scrolled its own (taller) content. Pins:
 * the desktop root stretches (`min-[940px]:h-full`) and independently
 * scrolls (`min-[940px]:overflow-y-auto`) rather than floating a short card
 * inside a stretched empty cell, and the new related-context sections
 * (other open signals for the same player, focus areas, goals, recent
 * trend) render real data — falling back to an honest "None yet" line
 * instead of a blank field when a section has nothing.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import type { PlayersGridFocusArea, PlayersGridStats } from '@/components/fairway';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import { SignalDossier } from '../SignalDossier';

// PromoteToFocusAreaButton (rendered inline) reaches into a 'use server'
// action module for its Prescribe click handler — never invoked here (no
// click), but stub it so the import graph stays inert in jsdom.
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(),
}));

function makeSignal(overrides: Partial<GroupedSignal> = {}): GroupedSignal {
  return {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Putting leak',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.8,
    playerId: 'player-1',
    supersededCount: 0,
    ...overrides,
  };
}

function makeGroup(signals: GroupedSignal[]): SignalGroup {
  return {
    playerId: 'player-1',
    playerName: 'Alex Rivera',
    attentionScore: 10,
    worstSeverity: 'high',
    signals,
  };
}

function makeFocusArea(overrides: Partial<PlayersGridFocusArea> = {}): PlayersGridFocusArea {
  return {
    id: 'fa-1',
    area_type: 'putting',
    title: 'Lag putting drill',
    status: 'active',
    player_id: 'player-1',
    ...overrides,
  } as PlayersGridFocusArea;
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    player_id: 'player-1',
    team_id: 'team-1',
    created_by_user_id: 'user-1',
    creator_role: 'player',
    coach_id_if_assigned: null,
    metric_id: 'gir_pct',
    title: 'Cut 3-putts in half',
    category: 'putting',
    started_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-08-01T00:00:00.000Z',
    window_days: 30,
    baseline_value: 10,
    current_value: 6,
    target_value: 5,
    target_source: 'manual',
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: true,
    shared_at: '2026-06-01T00:00:00.000Z',
    coach_assignment_mode: null,
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'manual',
    origin_insight_id: null,
    snapshots: [],
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  } as Goal;
}

function baseProps() {
  return {
    coachId: 'coach-1',
    pending: false,
    onReview: vi.fn(),
    onDismiss: vi.fn(),
    onPromoted: vi.fn(),
    onBack: vi.fn(),
  };
}

describe('SignalDossier — related context', () => {
  it('lists the player\'s OTHER open signals, excluding the currently viewed one', () => {
    const current = makeSignal({ id: 'signal-1', title: 'Three-putt rate climbing' });
    const other = makeSignal({ id: 'signal-2', title: 'Approach proximity slipping', category: 'approach' });
    render(
      <SignalDossier
        {...baseProps()}
        entry={{ signal: current, group: makeGroup([current, other]) }}
      />,
    );

    expect(screen.getByText('Approach proximity slipping')).toBeInTheDocument();
    // The current signal's own title appears once as the headline, not again
    // in the "other signals" list.
    expect(screen.getAllByText('Three-putt rate climbing')).toHaveLength(1);
  });

  it('renders an honest "no other open signals" line when this is the only one', () => {
    const current = makeSignal();
    render(<SignalDossier {...baseProps()} entry={{ signal: current, group: makeGroup([current]) }} />);
    expect(screen.getByText('No other open signals for this player.')).toBeInTheDocument();
  });

  it('shows this player\'s active focus areas with a status pill', () => {
    const current = makeSignal();
    render(
      <SignalDossier
        {...baseProps()}
        entry={{ signal: current, group: makeGroup([current]) }}
        playerFocusAreas={[makeFocusArea(), makeFocusArea({ id: 'fa-2', status: 'completed', title: 'Wedge distance control' })]}
      />,
    );
    // Only the active one shows in this section (completed excluded).
    expect(screen.getByText('Lag putting drill')).toBeInTheDocument();
    expect(screen.queryByText('Wedge distance control')).not.toBeInTheDocument();
  });

  it('renders an honest "no active focus areas" line when there are none', () => {
    const current = makeSignal();
    render(<SignalDossier {...baseProps()} entry={{ signal: current, group: makeGroup([current]) }} />);
    expect(screen.getByText('No active focus areas yet.')).toBeInTheDocument();
  });

  it('shows this player\'s active goals', () => {
    const current = makeSignal();
    const goalData: FairwayGoalCardData = { goal: makeGoal() };
    render(
      <SignalDossier
        {...baseProps()}
        entry={{ signal: current, group: makeGroup([current]) }}
        playerGoals={[goalData]}
      />,
    );
    expect(screen.getByText('Cut 3-putts in half')).toBeInTheDocument();
  });

  it('renders a recent-trend chip when player stats carry a trend', () => {
    const current = makeSignal();
    const stats: PlayersGridStats = {
      rounds_played: 8,
      avg_score: 74.2,
      avg_putts: 30.1,
      fairway_pct: 61,
      gir_pct: 55,
      best_score: 70,
      recent_trend: 'declining',
    };
    render(
      <SignalDossier
        {...baseProps()}
        entry={{ signal: current, group: makeGroup([current]) }}
        playerStats={stats}
      />,
    );
    expect(screen.getByText('74.2 avg score')).toBeInTheDocument();
  });

  it('renders an honest "not enough rounds" line when there is no trend signal yet', () => {
    const current = makeSignal();
    render(<SignalDossier {...baseProps()} entry={{ signal: current, group: makeGroup([current]) }} />);
    expect(screen.getByText('Not enough recent rounds for a trend yet.')).toBeInTheDocument();
  });

  it('fires onSelectSignal when a related-signal row is clicked', async () => {
    const current = makeSignal({ id: 'signal-1' });
    const other = makeSignal({ id: 'signal-2', title: 'Approach proximity slipping' });
    const onSelectSignal = vi.fn();
    render(
      <SignalDossier
        {...baseProps()}
        entry={{ signal: current, group: makeGroup([current, other]) }}
        onSelectSignal={onSelectSignal}
      />,
    );
    screen.getByText('Approach proximity slipping').click();
    expect(onSelectSignal).toHaveBeenCalledWith('signal-2');
  });

  it('the desktop root fills and independently scrolls (no blank canvas below the action row)', () => {
    const current = makeSignal();
    const { container } = render(
      <SignalDossier {...baseProps()} entry={{ signal: current, group: makeGroup([current]) }} />,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain('min-[940px]:h-full');
    expect(root?.className).toContain('min-[940px]:overflow-y-auto');
  });
});
