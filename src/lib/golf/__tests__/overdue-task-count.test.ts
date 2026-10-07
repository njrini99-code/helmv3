import { describe, it, expect } from 'vitest';
import {
  countCoachOverdueTasks,
  countPlayerOverdueTasks,
  overdueQueryUpperBound,
} from '@/lib/golf/overdue-task-count';

const NY = 'America/New_York';
// 23:00 in New York on Aug 17 = 03:00Z Aug 18. UTC already says "18th".
const LATE_EVENING_NY = new Date('2026-08-18T03:00:00.000Z');

describe('countPlayerOverdueTasks', () => {
  it('counts only incomplete, this-team assignments due before today', () => {
    const rows = [
      { status: 'pending', task: { due_date: '2026-08-10', team_id: 't1' } },
      { status: null, task: { due_date: '2026-08-11', team_id: 't1' } }, // null reads as pending
      { status: 'in_progress', task: { due_date: '2026-08-12', team_id: 't1' } },
      { status: 'completed', task: { due_date: '2026-08-10', team_id: 't1' } },
      { status: 'pending', task: { due_date: '2026-08-10', team_id: 'other-team' } },
      { status: 'pending', task: { due_date: null, team_id: 't1' } },
      { status: 'pending', task: null },
    ];
    expect(countPlayerOverdueTasks(rows, 't1', NY, LATE_EVENING_NY)).toBe(3);
  });

  it('decides "before today" on the team clock, not UTC', () => {
    const dueToday = [{ status: 'pending', task: { due_date: '2026-08-17', team_id: 't1' } }];
    const dueYesterday = [{ status: 'pending', task: { due_date: '2026-08-16', team_id: 't1' } }];
    // UTC is already on the 18th, but in New York it is still the 17th.
    expect(countPlayerOverdueTasks(dueToday, 't1', NY, LATE_EVENING_NY)).toBe(0);
    expect(countPlayerOverdueTasks(dueYesterday, 't1', NY, LATE_EVENING_NY)).toBe(1);
  });
});

describe('countCoachOverdueTasks', () => {
  it('applies the Tasks page rollup and counts tasks, not assignments', () => {
    const tasks = [
      // one assignee still pending -> incomplete
      { status: 'pending', due_date: '2026-08-10', assignments: [{ status: 'completed' }, { status: 'pending' }] },
      // everyone completed -> complete, even with a stale task status
      { status: 'pending', due_date: '2026-08-10', assignments: [{ status: 'completed' }, { status: 'completed' }] },
      // no assignees -> task status decides
      { status: 'pending', due_date: '2026-08-10', assignments: [] },
      { status: 'completed', due_date: '2026-08-10', assignments: [] },
      { status: null, due_date: '2026-08-10', assignments: null },
      // due today on the team clock -> not overdue yet
      { status: 'pending', due_date: '2026-08-17', assignments: [{ status: 'pending' }] },
    ];
    expect(countCoachOverdueTasks(tasks, NY, LATE_EVENING_NY)).toBe(3);
  });

  it('returns 0 for no tasks', () => {
    expect(countCoachOverdueTasks([], NY, LATE_EVENING_NY)).toBe(0);
  });
});

describe('overdueQueryUpperBound', () => {
  it('is UTC today + 1, a superset of every zone\'s today', () => {
    expect(overdueQueryUpperBound(LATE_EVENING_NY)).toBe('2026-08-19');
  });
});
