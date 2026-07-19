// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayGoalCard — title no longer clips (audit fix)
 * ----------------------------------------------------------------------------
 * Bug fixed (round 2, mustFix on wf/fix-player-my-development):
 *   The goal title `<h3>` used `truncate` (single line, ellipsis) — a long
 *   goal name (common on the player's "Recent wins" achieved-goals block)
 *   clipped mid-word. Swapped for `line-clamp-2` so the full title wraps to
 *   up to 2 lines instead of being cut off.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import { FairwayGoalCard, type FairwayGoalCardData } from './FairwayGoalCard';

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
    current_value: 60,
    target_value: 65,
    target_source: 'manual',
    state: 'achieved',
    outcome_evaluated_at: '2026-07-10T00:00:00.000Z',
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

describe('FairwayGoalCard — title never truncates to a single clipped line', () => {
  it('renders the title with line-clamp (wraps), not `truncate` (single-line ellipsis)', () => {
    const data: FairwayGoalCardData = { goal: makeGoal() };
    const { container } = render(
      <FairwayGoalCard
        data={data}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
      />,
    );
    const title = container.querySelector('h3');
    expect(title).not.toBeNull();
    expect(title!.className).not.toMatch(/\btruncate\b/);
    expect(title!.className).toMatch(/line-clamp-2/);
  });

  it('renders the full text content of a long title in the DOM (CSS clamps display, not content)', () => {
    // gir_pct has a registered display label ("GIR %"), so a long TITLE only
    // shows up via a goal on an unregistered metric — use one to exercise the
    // humanized-key fallback path with a long value.
    const data: FairwayGoalCardData = {
      goal: makeGoal({
        // @ts-expect-error — deliberately an unregistered id for this test's
        // humanize-fallback path.
        metric_id: 'a_very_long_unregistered_custom_metric_identifier',
      }),
    };
    const { container } = render(
      <FairwayGoalCard
        data={data}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
      />,
    );
    const title = container.querySelector('h3');
    expect(title?.textContent).toBe('A Very Long Unregistered Custom Metric Identifier');
  });
});
