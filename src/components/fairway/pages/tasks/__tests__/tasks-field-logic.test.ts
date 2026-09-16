/**
 * Tasks field-sheet logic — deterministic unit tests.
 *
 * Every case passes `today` as a bare string, so nothing here depends on the
 * runner's clock or timezone. The point of the module is that one predicate
 * feeds the masthead, the stage, the ledger and the table; these tests pin
 * that agreement rather than each caller's own arithmetic.
 */
import { describe, it, expect } from 'vitest';

import {
  DOMAIN_LIMIT_YEARS,
  TEAM_LANE,
  TEAM_LANE_NAME,
  UNCATEGORIZED,
  buildTasksVerdict,
  canExpand,
  daysLate,
  dueDomain,
  dueFieldCap,
  dueLabel,
  dueLanes,
  filterTasks,
  isOverdue,
  isPlottable,
  localMidnight,
  markLabel,
  openByCategory,
  openCount,
  openItems,
  overdueCount,
  overdueLedger,
  shortDate,
  undatedOpenTasks,
  worstOffender,
  type FairwayTask,
  type TaskAssignment,
} from '../tasks-field-logic';

const TODAY = '2026-09-10';

function player(id: string, first: string, last: string): TaskAssignment['player'] {
  return { id, first_name: first, last_name: last };
}

function assignment(id: string, p: TaskAssignment['player'], status = 'pending'): TaskAssignment {
  return { id, status, completed_at: null, player: p };
}

function task(overrides: Partial<FairwayTask> = {}): FairwayTask {
  return {
    id: 'task-1',
    title: 'Film 9 holes',
    description: null,
    due_date: null,
    status: 'active',
    created_at: '2026-08-01T00:00:00.000Z',
    reminder_at: null,
    category: null,
    assignments: [],
    ...overrides,
  };
}

const ana = player('p-ana', 'Ana', 'Ruiz');
const bo = player('p-bo', 'Bo', 'Chen');

describe('date arithmetic (local midnight, no clock)', () => {
  it('parses a date-only column at LOCAL midnight, not UTC midnight', () => {
    const t = localMidnight('2026-09-10');
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });

  it('reads a full timestamp by its day part, so a Z-suffixed value never shifts', () => {
    expect(localMidnight('2026-09-10T23:30:00.000Z')).toBe(localMidnight('2026-09-10'));
  });

  it('counts whole days late, zero on the due day and negative before it', () => {
    expect(daysLate('2026-09-01', TODAY)).toBe(9);
    expect(daysLate(TODAY, TODAY)).toBe(0);
    expect(daysLate('2026-09-12', TODAY)).toBe(-2);
  });

  it('spans a month boundary without drifting', () => {
    expect(daysLate('2026-08-31', TODAY)).toBe(10);
  });

  it('formats a day from its own string parts', () => {
    expect(shortDate('2026-09-10')).toBe('Sep 10');
    expect(shortDate('2026-01-05T00:00:00Z')).toBe('Jan 5');
  });

  it('labels today and tomorrow, and dates everything else', () => {
    expect(dueLabel(TODAY, TODAY)).toBe('Today');
    expect(dueLabel('2026-09-11', TODAY)).toBe('Tomorrow');
    expect(dueLabel('2026-09-02', TODAY)).toBe('Sep 2');
  });
});

describe('isOverdue — the one predicate every region reads', () => {
  it('is NOT overdue on its own due day', () => {
    expect(isOverdue(task({ due_date: TODAY }), TODAY)).toBe(false);
  });

  it('is overdue the day after', () => {
    expect(isOverdue(task({ due_date: '2026-09-09' }), TODAY)).toBe(true);
  });

  it('is never overdue without a due date', () => {
    expect(isOverdue(task({ due_date: null }), TODAY)).toBe(false);
  });

  it('is never overdue once completed', () => {
    expect(isOverdue(task({ due_date: '2026-01-01', status: 'completed' }), TODAY)).toBe(false);
  });

  it('counts the same set the ledger lists', () => {
    const tasks = [
      task({ id: 'a', due_date: '2026-09-01' }),
      task({ id: 'b', due_date: '2026-09-09' }),
      task({ id: 'c', due_date: TODAY }),
      task({ id: 'd', due_date: '2026-01-01', status: 'completed' }),
    ];
    expect(overdueCount(tasks, TODAY)).toBe(2);
    expect(overdueLedger(tasks, TODAY).map((r) => r.task.id)).toEqual(['a', 'b']);
  });

  it('orders the ledger worst-first', () => {
    const rows = overdueLedger(
      [task({ id: 'a', due_date: '2026-09-09' }), task({ id: 'b', due_date: '2026-08-01' })],
      TODAY,
    );
    expect(rows.map((r) => r.daysLate)).toEqual([40, 1]);
  });
});

describe('openItems — one shape for assignment rows and team-wide tasks', () => {
  it('emits one item per incomplete assignment', () => {
    const items = openItems(
      [task({ assignments: [assignment('a1', ana), assignment('a2', bo, 'completed')] })],
      'coach',
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.laneName).toBe('Ana Ruiz');
    expect(items[0]?.playerId).toBe('p-ana');
  });

  it('gives an assignment-less task the terminal team lane, with no player to name', () => {
    const items = openItems([task({ assignments: [] })], 'coach');
    expect(items[0]?.laneId).toBe(TEAM_LANE);
    expect(items[0]?.laneName).toBe(TEAM_LANE_NAME);
    expect(items[0]?.playerId).toBeNull();
  });

  it('drops the team lane entirely for a player viewer', () => {
    expect(openItems([task({ assignments: [] })], 'player')).toHaveLength(0);
  });

  it('labels the player view’s synthetic nameless assignment "You", never a blank', () => {
    const items = openItems(
      [task({ assignments: [assignment('a1', player('me', '', ''))] })],
      'player',
    );
    expect(items[0]?.laneName).toBe('You');
  });

  it('never invents a coach-side name when the join did not resolve', () => {
    const items = openItems([task({ assignments: [assignment('a1', player('p-x', '', ''))] })], 'coach');
    expect(items[0]?.laneName).toBe('Unnamed player');
  });

  it('skips completed tasks altogether', () => {
    expect(openItems([task({ status: 'completed', assignments: [assignment('a1', ana)] })], 'coach')).toHaveLength(0);
  });
});

describe('worstOffender — one function, two call sites', () => {
  const tasks = [
    task({ id: 't1', title: 'Range block', due_date: '2026-09-01', assignments: [assignment('a1', ana)] }),
    task({ id: 't2', title: 'Gym', due_date: '2026-09-08', assignments: [assignment('a2', bo)] }),
    task({ id: 't3', title: 'Study hall', due_date: '2026-09-12', assignments: [assignment('a3', ana)] }),
  ];

  it('picks the single largest days-late across every lane', () => {
    const worst = worstOffender(openItems(tasks, 'coach'), TODAY);
    expect(worst?.laneName).toBe('Ana Ruiz');
    expect(worst?.daysLate).toBe(9);
    expect(worst?.title).toBe('Range block');
  });

  it('agrees with the lane the stage draws for the same person', () => {
    const masthead = worstOffender(openItems(tasks, 'coach'), TODAY);
    const lane = dueLanes(tasks, TODAY, 'coach').find((l) => l.name === 'Ana Ruiz');
    expect(lane?.worst?.daysLate).toBe(masthead?.daysLate);
    expect(lane?.worst?.title).toBe(masthead?.title);
  });

  it('returns null when nothing is late', () => {
    expect(worstOffender(openItems([task({ due_date: '2026-09-30', assignments: [assignment('a', ana)] })], 'coach'), TODAY)).toBeNull();
  });

  it('breaks a days-late tie by title, so the sentence is stable across renders', () => {
    const tied = [
      task({ id: 'b', title: 'Zebra drill', due_date: '2026-09-05', assignments: [assignment('ab', ana)] }),
      task({ id: 'a', title: 'Alpha drill', due_date: '2026-09-05', assignments: [assignment('aa', bo)] }),
    ];
    expect(worstOffender(openItems(tied, 'coach'), TODAY)?.title).toBe('Alpha drill');
  });
});

describe('dueLanes', () => {
  it('gives no lane to a player with no open DATED work', () => {
    const lanes = dueLanes([task({ due_date: null, assignments: [assignment('a1', ana)] })], TODAY, 'coach');
    expect(lanes).toHaveLength(0);
  });

  it('counts undated work in Load even though it draws no mark', () => {
    const lanes = dueLanes(
      [
        task({ id: 't1', due_date: '2026-09-15', assignments: [assignment('a1', ana)] }),
        task({ id: 't2', due_date: null, assignments: [assignment('a2', ana)] }),
      ],
      TODAY,
      'coach',
    );
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.load).toBe(2);
    expect(lanes[0]?.marks).toHaveLength(1);
  });

  it('sorts worst-late first and keeps the team lane terminal', () => {
    const lanes = dueLanes(
      [
        task({ id: 't1', due_date: '2026-09-09', assignments: [assignment('a1', bo)] }),
        task({ id: 't2', due_date: '2026-08-01', assignments: [assignment('a2', ana)] }),
        task({ id: 't3', due_date: '2026-06-01', assignments: [] }),
      ],
      TODAY,
      'coach',
    );
    expect(lanes.map((l) => l.name)).toEqual(['Ana Ruiz', 'Bo Chen', TEAM_LANE_NAME]);
    expect(lanes[2]?.href).toBeNull();
  });

  it('links a player lane to their roster page', () => {
    const lanes = dueLanes([task({ due_date: '2026-09-15', assignments: [assignment('a1', ana)] })], TODAY, 'coach');
    expect(lanes[0]?.href).toBe('/golf/dashboard/roster/p-ana');
  });

  it('carries the next due date for a lane that is not late, so the row still states a value', () => {
    const lanes = dueLanes(
      [
        task({ id: 't1', due_date: '2026-09-20', assignments: [assignment('a1', ana)] }),
        task({ id: 't2', due_date: '2026-09-14', assignments: [assignment('a2', ana)] }),
      ],
      TODAY,
      'coach',
    );
    expect(lanes[0]?.worst).toBeNull();
    expect(lanes[0]?.nextDue).toBe('2026-09-14');
  });

  it('keeps an impossible due date off the axis without hiding the work', () => {
    const junk = task({ id: 'junk', due_date: '60824-02-02', assignments: [assignment('a1', ana)] });
    expect(isPlottable('60824-02-02', TODAY)).toBe(false);
    const lanes = dueLanes([junk], TODAY, 'coach');
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.marks).toHaveLength(0);
    expect(lanes[0]?.offAxis).toBe(true);
    expect(lanes[0]?.load).toBe(1);
  });

  it('accepts a date inside the plottable window', () => {
    expect(isPlottable('2027-09-10', TODAY)).toBe(true);
    expect(DOMAIN_LIMIT_YEARS).toBe(5);
  });

  it('marks carry the whole fact for their tooltip', () => {
    expect(markLabel('Range block', '2026-09-01', TODAY)).toBe('Range block — due Sep 1, 9 days late');
    expect(markLabel('Range block', TODAY, TODAY)).toBe('Range block — due today');
    expect(markLabel('Range block', '2026-09-11', TODAY)).toBe('Range block — due Sep 11, in 1 day');
  });
});

describe('dueDomain and dueFieldCap', () => {
  const lanes = dueLanes(
    [
      task({ id: 't1', due_date: '2026-08-20', assignments: [assignment('a1', ana)] }),
      task({ id: 't2', due_date: '2026-10-05', assignments: [assignment('a2', bo)] }),
    ],
    TODAY,
    'coach',
  );

  it('spans the earliest through latest plotted date', () => {
    expect(dueDomain(lanes, TODAY)).toEqual({ start: '2026-08-20', end: '2026-10-05' });
  });

  it('always contains today, so the Today rule sits inside the field', () => {
    const future = dueLanes([task({ due_date: '2026-12-01', assignments: [assignment('a', ana)] })], TODAY, 'coach');
    expect(dueDomain(future, TODAY).start).toBe(TODAY);
  });

  it('clamps the bar cap between 3 and 21 days late', () => {
    expect(dueFieldCap(lanes)).toBe(21);
    const mild = dueLanes([task({ due_date: '2026-09-09', assignments: [assignment('a', ana)] })], TODAY, 'coach');
    expect(dueFieldCap(mild)).toBe(3);
    const nothingLate = dueLanes([task({ due_date: '2026-12-01', assignments: [assignment('a', ana)] })], TODAY, 'coach');
    expect(dueFieldCap(nothingLate)).toBe(3);
  });
});

describe('buildTasksVerdict — missing facts in strict precedence', () => {
  const base = {
    role: 'coach' as const,
    hasError: false,
    totalTasks: 12,
    openTasks: 7,
    overdueTasks: 3,
    completionRate: 42,
    worst: null,
  };
  const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

  it('a load error outranks everything, and quotes no number', () => {
    const parts = buildTasksVerdict({ ...base, hasError: true });
    expect(text(parts)).toBe("Couldn't load tasks.");
    expect(text(parts)).not.toMatch(/\d/);
  });

  it('an empty list outranks a zero count', () => {
    expect(text(buildTasksVerdict({ ...base, hasError: false, totalTasks: 0 }))).toBe('No tasks yet.');
    expect(text(buildTasksVerdict({ ...base, role: 'player', totalTasks: 0 }))).toBe('Nothing assigned yet.');
  });

  it('says nothing is overdue without inventing an offender', () => {
    const parts = buildTasksVerdict({ ...base, overdueTasks: 0 });
    expect(text(parts)).toBe('Nothing overdue. 7 still open, 42% of all tasks done.');
  });

  it('gets its own sentence when every overdue task is team-wide', () => {
    const parts = buildTasksVerdict({ ...base, worst: null });
    expect(text(parts)).toContain('all team-wide with no single assignee to flag');
    expect(parts.some((p) => p.href)).toBe(false);
  });

  it('names and links the worst offender when there is one', () => {
    const worst = {
      key: 'a1',
      taskId: 't1',
      title: 'Range block',
      dueDate: '2026-09-01',
      laneId: 'p-ana',
      laneName: 'Ana Ruiz',
      playerId: 'p-ana',
      daysLate: 9,
    };
    const parts = buildTasksVerdict({ ...base, worst });
    expect(text(parts)).toBe(
      '3 tasks overdue. Ana Ruiz is furthest behind, 9 days late on "Range block." 7 still open, 42% of all tasks done.',
    );
    expect(parts.find((p) => p.href)?.href).toBe('/golf/dashboard/roster/p-ana');
  });

  it('singularizes one overdue task and one day', () => {
    const worst = {
      key: 'a1',
      taskId: 't1',
      title: 'Gym',
      dueDate: '2026-09-09',
      laneId: 'p-bo',
      laneName: 'Bo Chen',
      playerId: 'p-bo',
      daysLate: 1,
    };
    expect(text(buildTasksVerdict({ ...base, overdueTasks: 1, worst }))).toContain('1 task overdue.');
    expect(text(buildTasksVerdict({ ...base, overdueTasks: 1, worst }))).toContain('1 day late');
  });

  it('speaks first person for a player, with nobody else to name', () => {
    const worst = {
      key: 'a1',
      taskId: 't1',
      title: 'Gym',
      dueDate: '2026-09-01',
      laneId: 'me',
      laneName: 'You',
      playerId: 'me',
      daysLate: 9,
    };
    const parts = buildTasksVerdict({ ...base, role: 'player', overdueTasks: 2, worst });
    expect(text(parts)).toBe('2 of yours are overdue. Worst is 9 days late on "Gym." 7 left, 42% done.');
  });
});

describe('ledger columns and table filters', () => {
  const tasks = [
    task({ id: 't1', title: 'Range block', category: 'Practice', due_date: '2026-09-01' }),
    task({ id: 't2', title: 'Gym', category: 'Fitness', due_date: null }),
    task({ id: 't3', title: 'Study hall', category: null, due_date: null }),
    task({ id: 't4', title: 'Old chore', category: 'Practice', status: 'completed' }),
  ];

  it('groups only OPEN work by category, with the uncategorized bucket', () => {
    const rows = openByCategory(tasks);
    expect(rows).toEqual([
      { value: 'Fitness', label: 'Fitness', count: 1 },
      { value: 'Practice', label: 'Practice', count: 1 },
      { value: UNCATEGORIZED, label: 'Uncategorized', count: 1 },
    ]);
  });

  it('lists the open, undated tasks the stage necessarily excludes', () => {
    expect(undatedOpenTasks(tasks).map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('counts open tasks without counting the completed one', () => {
    expect(openCount(tasks)).toBe(3);
  });

  it('narrows by status, search and category together', () => {
    expect(filterTasks(tasks, { status: 'all', query: 'gym', categories: [] }).map((t) => t.id)).toEqual(['t2']);
    expect(filterTasks(tasks, { status: 'completed', query: '', categories: [] }).map((t) => t.id)).toEqual(['t4']);
    expect(filterTasks(tasks, { status: 'all', query: '', categories: [UNCATEGORIZED] }).map((t) => t.id)).toEqual(['t3']);
    expect(filterTasks(tasks, { status: 'active', query: '', categories: ['Practice'] }).map((t) => t.id)).toEqual(['t1']);
  });
});

describe('canExpand — never an affordance that opens nothing', () => {
  it('is false for a bare task with only a title and a due date', () => {
    expect(canExpand(task({ due_date: TODAY }), 'coach')).toBe(false);
  });

  it('is false for a team-wide task seen by a coach, which has no assignments', () => {
    expect(canExpand(task({ assignments: [] }), 'coach')).toBe(false);
  });

  it('is true once there is a description, a reminder, or assignees to show', () => {
    expect(canExpand(task({ description: 'Bring a wedge' }), 'player')).toBe(true);
    expect(canExpand(task({ reminder_at: '2026-09-11T09:00:00Z' }), 'player')).toBe(true);
    expect(canExpand(task({ assignments: [assignment('a1', ana)] }), 'coach')).toBe(true);
  });
});
