import { describe, it, expect } from 'vitest';
import { computeTaskStats } from '../use-task-realtime';

/* ---------------------------------------------------------------------------
 * computeTaskStats (W1 count-coherence audit)
 * ----------------------------------------------------------------------------
 * `overdue_tasks` must equal the count of rows FLAGGED overdue — regardless of
 * whether that row is also `pending` or `in_progress`. The regression this
 * guards against: an earlier version computed the four counts as an if/else-if
 * chain (completed → in_progress → overdue → pending), which made overdue
 * mutually exclusive with in_progress. An in_progress task past its due date
 * was counted only toward in_progress_tasks and silently dropped out of
 * overdue_tasks, so the "N overdue tasks need attention" banner undercounted
 * relative to the tasks the list itself renders with the red overdue treatment.
 * No time, no I/O — pure function only.
 * ------------------------------------------------------------------------- */

describe('computeTaskStats', () => {
  it('counts an in_progress-and-overdue task toward BOTH in_progress_tasks and overdue_tasks', () => {
    const stats = computeTaskStats([
      { status: 'in_progress', is_overdue: true },
    ]);
    expect(stats.in_progress_tasks).toBe(1);
    expect(stats.overdue_tasks).toBe(1);
    expect(stats.pending_tasks).toBe(0);
  });

  it('matches the audit repro: 5 active (pending + in_progress) tasks read overdue, not 3', () => {
    const tasks: Array<{ status: 'pending' | 'in_progress' | 'completed'; is_overdue: boolean }> = [
      { status: 'pending', is_overdue: true },
      { status: 'pending', is_overdue: true },
      { status: 'pending', is_overdue: true },
      // Previously mis-bucketed as "in_progress only" — never counted overdue.
      { status: 'in_progress', is_overdue: true },
      { status: 'in_progress', is_overdue: true },
      // Not overdue — active but not past due.
      { status: 'pending', is_overdue: false },
      { status: 'in_progress', is_overdue: false },
      // Completed tasks never count as overdue regardless of due date.
      { status: 'completed', is_overdue: false },
    ];

    const stats = computeTaskStats(tasks);
    expect(stats.overdue_tasks).toBe(5);
    expect(stats.pending_tasks).toBe(4);
    expect(stats.in_progress_tasks).toBe(3);
    expect(stats.completed_tasks).toBe(1);
    expect(stats.total_tasks).toBe(8);
  });

  it('never counts a completed task as overdue', () => {
    const stats = computeTaskStats([{ status: 'completed', is_overdue: false }]);
    expect(stats.overdue_tasks).toBe(0);
    expect(stats.completed_tasks).toBe(1);
  });

  it('computes an honest 0 for an empty list (no NaN completion_rate)', () => {
    const stats = computeTaskStats([]);
    expect(stats).toEqual({
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      in_progress_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0,
    });
  });
});
