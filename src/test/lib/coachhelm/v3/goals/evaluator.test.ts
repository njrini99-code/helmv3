/**
 * Unit tests for the v3 goal evaluator pure core (P1-07).
 *
 * Acceptance coverage:
 *   - Active goal appends a snapshot after a new eligible observed value.
 *   - Goal transitions to achieved when the observed value meets the target.
 *   - Goal transitions to missed past the deadline with a target.
 *   - Goal transitions to expired past the deadline with no target.
 *   - No observed value + not past deadline → unchanged (never fabricates).
 *   - Same-day re-evaluation replaces today's reading (no duplicate snapshots).
 *   - Direction-aware satisfaction (higher_better vs lower_better).
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateGoal,
  meetsTarget,
  type GoalSnapshot,
} from '@/lib/coachhelm/v3/goals/evaluator';

const FUTURE = '2999-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const NOW = new Date('2026-06-21T12:00:00.000Z');
const TODAY = '2026-06-21';

describe('meetsTarget', () => {
  it('higher_better met when value ≥ target', () => {
    expect(meetsTarget(0.5, 0.5, 'higher_better')).toBe(true);
    expect(meetsTarget(0.6, 0.5, 'higher_better')).toBe(true);
    expect(meetsTarget(0.4, 0.5, 'higher_better')).toBe(false);
  });
  it('lower_better met when value ≤ target', () => {
    expect(meetsTarget(0.3, 0.3, 'lower_better')).toBe(true);
    expect(meetsTarget(0.2, 0.3, 'lower_better')).toBe(true);
    expect(meetsTarget(0.4, 0.3, 'lower_better')).toBe(false);
  });
});

describe('evaluateGoal', () => {
  it('appends a snapshot for a new observed value while the goal stays active', () => {
    const res = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: 0.3,
      snapshots: [],
      now: NOW,
    });
    expect(res.state).toBe('active');
    expect(res.appended).toBe(true);
    expect(res.unchanged).toBe(false);
    expect(res.current_value).toBe(0.3);
    expect(res.snapshots).toEqual<GoalSnapshot[]>([{ date: TODAY, value: 0.3, team_avg: null }]);
    expect(res.outcome_evaluated_at).toBeNull();
  });

  it('transitions to achieved when the observed value meets the target', () => {
    const res = evaluateGoal({
      target_value: 0.5,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: 0.55,
      snapshots: [{ date: '2026-06-20', value: 0.4 }],
      now: NOW,
    });
    expect(res.state).toBe('achieved');
    expect(res.current_value).toBe(0.55);
    expect(res.appended).toBe(true);
    // Evidence: the snapshot that crossed the target is recorded.
    expect(res.snapshots.at(-1)).toEqual({ date: TODAY, value: 0.55, team_avg: null });
    expect(res.outcome_evaluated_at).toBe(NOW.toISOString());
  });

  it('achieves a lower_better goal when value drops to/below target', () => {
    const res = evaluateGoal({
      target_value: 0.3,
      direction: 'lower_better',
      ends_at: FUTURE,
      observed_value: 0.25,
      snapshots: [],
      now: NOW,
    });
    expect(res.state).toBe('achieved');
  });

  it('transitions to missed past the deadline with an unmet target', () => {
    const res = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: PAST,
      observed_value: 0.4,
      snapshots: [],
      now: NOW,
    });
    expect(res.state).toBe('missed');
    expect(res.outcome_evaluated_at).toBe(NOW.toISOString());
    // The final observed reading is still recorded as evidence.
    expect(res.current_value).toBe(0.4);
  });

  it('transitions to expired past the deadline when there is no target', () => {
    const res = evaluateGoal({
      target_value: null,
      direction: 'higher_better',
      ends_at: PAST,
      observed_value: null,
      snapshots: [],
      now: NOW,
    });
    expect(res.state).toBe('expired');
    expect(res.outcome_evaluated_at).toBe(NOW.toISOString());
  });

  it('is unchanged (and writes nothing) with no observed value before the deadline', () => {
    const res = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: null,
      snapshots: [{ date: '2026-06-10', value: 0.2 }],
      now: NOW,
    });
    expect(res.unchanged).toBe(true);
    expect(res.appended).toBe(false);
    expect(res.state).toBe('active');
    // current_value reflects the last known observed reading, never a guess.
    expect(res.current_value).toBe(0.2);
    expect(res.snapshots).toHaveLength(1);
  });

  it('replaces today\'s reading on same-day re-evaluation (no duplicate snapshots)', () => {
    const first = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: 0.3,
      snapshots: [],
      now: NOW,
    });
    const second = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: 0.35, // a better reading later the same day
      snapshots: first.snapshots,
      now: NOW,
    });
    expect(second.snapshots).toHaveLength(1);
    expect(second.snapshots[0]).toEqual({ date: TODAY, value: 0.35, team_avg: null });
  });

  it('records team_avg alongside the snapshot when provided', () => {
    const res = evaluateGoal({
      target_value: 1.0,
      direction: 'higher_better',
      ends_at: FUTURE,
      observed_value: 0.3,
      snapshots: [],
      now: NOW,
      team_avg: 0.42,
    });
    expect(res.snapshots[0]).toEqual({ date: TODAY, value: 0.3, team_avg: 0.42 });
  });
});
