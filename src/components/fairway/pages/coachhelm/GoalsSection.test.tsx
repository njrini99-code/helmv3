// @vitest-environment jsdom
/**
 * ============================================================================
 * GoalsSection — "Goals in flight" coherence + 44px touch targets (audit fix)
 * ----------------------------------------------------------------------------
 * Bugs fixed (round 2, mustFix on wf/fix-player-my-development):
 *   #118/#125 — the "Goals in flight" InstrumentPanel rendered its accent hero
 *     header even at zero active goals, directly beneath (and contradicting)
 *     the honest "No active goals yet" EmptyState rendered right below it —
 *     a header CLAIMING goals are "in flight" over a caption reading "None
 *     set" is a self-contradiction, not an honest empty state. The header
 *     must now be gated on `hasGoals`: real progress (a genuine count) OR the
 *     plain EmptyState below — never both / never a hybrid.
 *   #194 — the Accept / Dismiss (suggestion row), "Set a goal" (empty-state +
 *     header action), and "Set another" (GoalHero header action) buttons
 *     rendered with the Button `size="sm"` prop, which is only 44px tall on
 *     coarse-pointer media queries — 36px on every other pointer.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { FairwayGoalCardData } from './FairwayGoalCard';
import { GoalsSection, type GoalSuggestionView } from './GoalsSection';

// GoalCreationModal is a heavy, real-write-action-backed overlay unrelated to
// this suite's concerns; stub it to a no-op so `canCreate` renders cleanly.
vi.mock('@/components/golf/coachhelm/v3/GoalCreationModal', () => ({
  GoalCreationModal: () => null,
}));

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    player_id: 'player-1',
    team_id: 'team-1',
    created_by_user_id: 'user-1',
    creator_role: 'player',
    coach_id_if_assigned: null,
    metric_id: 'gir_pct',
    title: 'GIR %',
    category: 'iron_play',
    started_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-08-01T00:00:00.000Z',
    window_days: 30,
    baseline_value: 50,
    current_value: 55,
    target_value: 65,
    target_source: 'manual',
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
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeGoalData(overrides: Partial<Goal> = {}): FairwayGoalCardData {
  return { goal: makeGoal(overrides) };
}

function makeSuggestion(): GoalSuggestionView {
  return {
    suggestion: {
      id: 'sugg-1',
      player_id: 'player-1',
      metric_id: 'gir_pct',
      suggested_at: '2026-07-01T00:00:00.000Z',
      suggested_target_value: 60,
      suggested_window_days: 30,
      origin_insight_id: null,
      state: 'pending',
      acted_at: null,
      snooze_until: null,
      expires_at: '2026-08-01T00:00:00.000Z',
    },
    display_label: 'GIR %',
    unit: 'percent',
  };
}

describe('GoalsSection — "Goals in flight" never contradicts the empty state', () => {
  it('renders ONLY the honest EmptyState (no "Goals in flight" hero) when there are zero active goals', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        canCreate
        activeGoals={[]}
        suggestions={[]}
      />,
    );
    expect(screen.queryByText('Goals in flight')).toBeNull();
    expect(screen.getByText('No active goals yet')).not.toBeNull();
  });

  it('renders the real "Goals in flight" count for the coach view when active goals exist (coach never gets the "one thing" hero)', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="coach"
        activeGoals={[makeGoalData(), makeGoalData({ id: 'goal-2' })]}
        suggestions={[]}
      />,
    );
    expect(screen.getByText('Goals in flight')).not.toBeNull();
    // The real, non-zero count — never a stray dash next to a "none" caption.
    expect(screen.getByText('2')).not.toBeNull();
    expect(screen.queryByText('None assigned')).toBeNull();
  });

  it('renders the honest EmptyState (not "Goals in flight") for the coach view with zero goals', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="coach"
        activeGoals={[]}
        suggestions={[]}
      />,
    );
    expect(screen.queryByText('Goals in flight')).toBeNull();
    expect(screen.getByText('No goals assigned yet')).not.toBeNull();
  });
});

describe('GoalsSection — 44px touch targets', () => {
  it('never renders a reused action button with the 36px-on-fine-pointer `sm` size', () => {
    const { container } = render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        canCreate
        activeGoals={[makeGoalData()]}
        suggestions={[makeSuggestion()]}
      />,
    );
    const buttons = container.querySelectorAll('button, a[data-slot="fw-button"]');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of Array.from(buttons)) {
      expect(btn.className).not.toMatch(/min-h-\[36px\]/);
    }
  });

  it('renders "Set a goal" (empty state) at the 44px md size', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        canCreate
        activeGoals={[]}
        suggestions={[]}
      />,
    );
    const setGoal = screen.getByRole('button', { name: /set a goal/i });
    expect(setGoal.className).toMatch(/min-h-\[44px\]/);
  });

  it('renders "Set another" (GoalHero header) at the 44px md size', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        canCreate
        activeGoals={[makeGoalData()]}
        suggestions={[]}
      />,
    );
    const setAnother = screen.getByRole('button', { name: /set another/i });
    expect(setAnother.className).toMatch(/min-h-\[44px\]/);
  });

  it('renders Accept/Dismiss on a suggestion row at the 44px md size', () => {
    render(
      <GoalsSection
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        canCreate
        activeGoals={[makeGoalData()]}
        suggestions={[makeSuggestion()]}
      />
    );
    const accept = screen.getByRole('button', { name: /^accept$/i });
    const dismiss = screen.getByRole('button', { name: /^dismiss$/i });
    expect(accept.className).toMatch(/min-h-\[44px\]/);
    expect(dismiss.className).toMatch(/min-h-\[44px\]/);
  });
});
