/**
 * Pure-core tests for `resolvePersonalContextHints` (goal/focus-area
 * hints, owner decision 2026-09-23: a code-level mapping table). No DB, no
 * adapters — plain `Goal`/`PlayerFocusArea` fixtures. Never a
 * `MetricResult` in sight, by contract.
 */
import { describe, it, expect } from 'vitest';
import { buildHypotheses, type MetricResult, type MetricStatus } from '@/lib/coachhelm/v3/reasoning/hypothesis-policy';
import { resolvePersonalContextHints } from '@/lib/coachhelm/v3/reasoning/personal-context';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { PlayerFocusArea, FocusAreaCategory } from '@/lib/coachhelm/insight-types';

function goal(overrides: Partial<Goal> & Pick<Goal, 'id' | 'metric_id'>): Goal {
  return {
    player_id: 'player-1',
    team_id: null,
    created_by_user_id: 'user-1',
    creator_role: 'player',
    coach_id_if_assigned: null,
    title: 'Test goal',
    category: 'scoring',
    started_at: '2026-06-01T00:00:00.000Z',
    ends_at: '2026-07-01T00:00:00.000Z',
    window_days: 30,
    baseline_value: null,
    current_value: null,
    target_value: null,
    target_source: null,
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

function focusArea(
  overrides: Partial<PlayerFocusArea> & Pick<PlayerFocusArea, 'id' | 'category'>,
): PlayerFocusArea {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    priority: 1,
    title: 'Test focus area',
    description: '',
    specific_drills: [],
    current_performance: {},
    target_improvement: null,
    status: 'active',
    progress_notes: null,
    is_auto_generated: false,
    last_reviewed_at: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolvePersonalContextHints — the mapping table has exactly one honest entry', () => {
  it('a mapped goal (scoring_par_5) raises par5_opportunity_loss, attributed to that goal', () => {
    const g = goal({ id: 'goal-1', metric_id: 'scoring_par_5' });
    const hints = resolvePersonalContextHints([g], []);
    expect(hints).toEqual({
      par5_opportunity_loss: { family: 'par5_opportunity_loss', reasons: ['goal:goal-1'] },
    });
  });

  it('an unmapped goal (gir_pct — no honest family match) has no effect', () => {
    const g = goal({ id: 'goal-1', metric_id: 'gir_pct' });
    expect(resolvePersonalContextHints([g], [])).toEqual({});
  });

  it('every FocusAreaCategory, at active status, resolves to nothing — the empty table is deliberate', () => {
    const categories: FocusAreaCategory[] = [
      'ball_striking',
      'short_game',
      'putting',
      'course_management',
      'mental_game',
      'tournament_performance',
    ];
    for (const category of categories) {
      const area = focusArea({ id: `fa-${category}`, category, status: 'active' });
      expect(resolvePersonalContextHints([], [area])).toEqual({});
    }
  });
});

describe('resolvePersonalContextHints — conflicting goals', () => {
  it('an active goal and an abandoned goal on the same mapped metric: only the active one counts', () => {
    const active = goal({ id: 'goal-active', metric_id: 'scoring_par_5', state: 'active' });
    const abandoned = goal({ id: 'goal-abandoned', metric_id: 'scoring_par_5', state: 'abandoned' });
    const hints = resolvePersonalContextHints([active, abandoned], []);
    expect(hints.par5_opportunity_loss?.reasons).toEqual(['goal:goal-active']);
  });

  it('an active goal and a pending_baseline goal on the same mapped metric: only the active one counts', () => {
    // Pins the judgment call documented in the module: pending_baseline has
    // no established baseline yet, so it does not raise priority even
    // though it is not a terminal state like abandoned/missed.
    const active = goal({ id: 'goal-active', metric_id: 'scoring_par_5', state: 'active' });
    const pending = goal({ id: 'goal-pending', metric_id: 'scoring_par_5', state: 'pending_baseline' });
    const hints = resolvePersonalContextHints([active, pending], []);
    expect(hints.par5_opportunity_loss?.reasons).toEqual(['goal:goal-active']);
  });

  it('a mapped goal and an unmapped goal together: only the mapped family appears', () => {
    const mapped = goal({ id: 'goal-mapped', metric_id: 'scoring_par_5' });
    const unmapped = goal({ id: 'goal-unmapped', metric_id: 'gir_pct' });
    const hints = resolvePersonalContextHints([mapped, unmapped], []);
    expect(Object.keys(hints)).toEqual(['par5_opportunity_loss']);
    expect(hints.par5_opportunity_loss?.reasons).toEqual(['goal:goal-mapped']);
  });

  it('two active goals on the same mapped metric accumulate both reasons, not an overwrite', () => {
    const first = goal({ id: 'goal-1', metric_id: 'scoring_par_5' });
    const second = goal({ id: 'goal-2', metric_id: 'scoring_par_5' });
    const hints = resolvePersonalContextHints([first, second], []);
    expect(hints.par5_opportunity_loss?.reasons).toEqual(['goal:goal-1', 'goal:goal-2']);
  });
});

describe('resolvePersonalContextHints — never touches MetricResults', () => {
  const SCOPE = {
    player_id: 'player-1',
    window_start: '2026-06-01',
    window_end: '2026-07-01',
    analysis_cutoff: '2026-07-01T12:00:00.000Z',
  };

  function metricRow(status: MetricStatus): MetricResult {
    return {
      scope: SCOPE,
      metricId: 'par5_regulation_opportunity_rate',
      dimensions: {},
      unit: 'percent',
      numerator: null,
      denominator: 0,
      eligibleCount: 0,
      observedCount: 0,
      distinctRounds: 0,
      exclusions: {},
      value: 30,
      status,
    };
  }

  it('metrics and the buildHypotheses output are byte-identical before and after resolving hints', () => {
    const metrics: readonly MetricResult[] = Object.freeze([metricRow('supported')]);
    const goals: readonly Goal[] = Object.freeze([
      Object.freeze(goal({ id: 'goal-1', metric_id: 'scoring_par_5' })),
    ]);
    const focusAreas: readonly PlayerFocusArea[] = Object.freeze([]);

    const metricsBefore = JSON.stringify(metrics);
    const hypothesesBefore = JSON.stringify(buildHypotheses(metrics, []));

    const hints = resolvePersonalContextHints(goals, focusAreas);
    expect(hints.par5_opportunity_loss).toBeDefined();

    expect(JSON.stringify(metrics)).toBe(metricsBefore);
    expect(JSON.stringify(buildHypotheses(metrics, []))).toBe(hypothesesBefore);
  });
});
