// =============================================================================
// Regression test for HONEST dev-plan progress (V10 — no fabricated metrics).
//
// THE BUG this guards: the HS team/coach dashboards built DevPlanProgress rows
// with completed_goals: Math.floor(Math.random()*5), progress_percentage:
// Math.floor(Math.random()*100), and a hardcoded total_goals: 5 — random values
// rendered to the coach as real per-player development progress. Every page load
// showed different numbers for the same player. These tests lock the rule:
//   * counts/percentages come ONLY from the plan's real `goals` JSONB;
//   * a plan with NO goals reports goals_tracked: false (UI shows "not tracked
//     yet"), NEVER an invented count or fill;
//   * progress_percentage is the mean of per-goal progress, clamped 0–100;
//   * results are deterministic (no randomness).
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeDevPlanProgress,
  buildDevPlanProgress,
  type DevPlanRowForProgress,
} from '../dev-plan-progress';

const player = { first_name: 'Jordan', last_name: 'Reyes' };

describe('computeDevPlanProgress', () => {
  it('reports goals_tracked: false with zero counts when the plan has no goals', () => {
    const row: DevPlanRowForProgress = { player_id: 'p1', goals: null, player };
    const result = computeDevPlanProgress(row);
    expect(result.goals_tracked).toBe(false);
    expect(result.total_goals).toBe(0);
    expect(result.completed_goals).toBe(0);
    expect(result.progress_percentage).toBe(0);
    expect(result.player_name).toBe('Jordan Reyes');
  });

  it('treats an empty goals array the same as no goals (honest empty)', () => {
    const row: DevPlanRowForProgress = { player_id: 'p1', goals: [], player };
    expect(computeDevPlanProgress(row).goals_tracked).toBe(false);
  });

  it('counts completed goals by status AND by 100% progress', () => {
    const row: DevPlanRowForProgress = {
      player_id: 'p1',
      goals: [
        { status: 'completed', progress: 100 },
        { status: 'in_progress', progress: 100 }, // 100% => complete even w/o status
        { status: 'in_progress', progress: 40 },
        { status: 'not_started', progress: 0 },
      ],
      player,
    };
    const result = computeDevPlanProgress(row);
    expect(result.total_goals).toBe(4);
    expect(result.completed_goals).toBe(2);
    // mean(100,100,40,0) = 60
    expect(result.progress_percentage).toBe(60);
    expect(result.goals_tracked).toBe(true);
  });

  it('clamps out-of-range / non-numeric progress instead of trusting it', () => {
    const row: DevPlanRowForProgress = {
      player_id: 'p1',
      goals: [
        { status: 'in_progress', progress: 150 }, // clamp -> 100
        { status: 'in_progress', progress: -20 }, // clamp -> 0
        { status: 'in_progress', progress: 'oops' }, // non-number -> 0
      ],
      player,
    };
    const result = computeDevPlanProgress(row);
    // mean(100,0,0) = 33.33 -> 33
    expect(result.progress_percentage).toBe(33);
  });

  it('is deterministic — same input yields the same output every call', () => {
    const row: DevPlanRowForProgress = {
      player_id: 'p1',
      goals: [{ status: 'in_progress', progress: 50 }],
      player,
    };
    const a = computeDevPlanProgress(row);
    const b = computeDevPlanProgress(row);
    expect(a).toEqual(b);
  });
});

describe('buildDevPlanProgress', () => {
  it('surfaces tracked plans before untracked, then by descending progress', () => {
    const rows: DevPlanRowForProgress[] = [
      { player_id: 'untracked', goals: [], player },
      { player_id: 'low', goals: [{ progress: 20 }], player },
      { player_id: 'high', goals: [{ progress: 90 }], player },
    ];
    const result = buildDevPlanProgress(rows);
    expect(result.map((r) => r.player_id)).toEqual(['high', 'low', 'untracked']);
  });

  it('caps the list to the requested limit', () => {
    const rows: DevPlanRowForProgress[] = Array.from({ length: 8 }, (_, i) => ({
      player_id: `p${i}`,
      goals: [{ progress: i * 10 }],
      player,
    }));
    expect(buildDevPlanProgress(rows, 5)).toHaveLength(5);
  });
});
