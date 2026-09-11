/**
 * FairwayTasks — render regression tests for the v3 field sheet.
 *
 *  - ONE CLOCK: `today` is a bare YYYY-MM-DD prop, so every case below is
 *    deterministic in any timezone and nothing waits for an effect to flush.
 *    A date-only `due_date` is parsed at LOCAL midnight; `new Date(str)` reads
 *    it as UTC midnight, which in any US zone rolls back a day and used to
 *    make a task due today read as overdue.
 *  - ONE PREDICATE: the masthead, the stage lane and the ledger are one
 *    derivation at three grains. These tests pin their agreement, which is the
 *    failure mode the spec exists to prevent.
 *  - #88: the per-task kebab (manage) menu opens on click.
 *  - Responsive: BOTH table branches are always in the DOM with CSS choosing,
 *    so nothing reads a breakpoint at runtime.
 *
 * Actions are mocked (colocated pattern) — only this file's own rendering
 * logic is under test.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/golf/actions/tasks', () => ({
  deleteTask: vi.fn(async () => ({ success: true })),
  setTaskReminder: vi.fn(async () => ({ success: true })),
  clearTaskReminder: vi.fn(async () => ({ success: true })),
}));

import { FairwayTasks, type FairwayTask, type FairwayTaskStats } from './FairwayTasks';

const TODAY = '2026-09-10';

const baseStats: FairwayTaskStats = {
  total_tasks: 1,
  completed_tasks: 0,
  pending_tasks: 1,
  in_progress_tasks: 0,
  overdue_tasks: 0,
  completion_rate: 0,
};

// jsx-a11y/aria-role false-positives on a literal `role={COACH_ROLE}` (it reads
// the prop as an ARIA role attribute, not this component's own `role` prop);
// routing it through a typed const — exactly how the real page.tsx caller
// passes it — sidesteps the misfire without suppressing the rule.
const COACH_ROLE: 'coach' | 'player' = 'coach';

function makeTask(overrides: Partial<FairwayTask> = {}): FairwayTask {
  return {
    id: 'task-1',
    title: 'Film 9 holes',
    description: null,
    due_date: null,
    status: 'active',
    created_at: '2026-07-01T00:00:00.000Z',
    reminder_at: null,
    category: null,
    assignments: [],
    ...overrides,
  };
}

function assigned(id: string, first: string, last: string) {
  return [{ id, status: 'pending', completed_at: null, player: { id, first_name: first, last_name: last } }];
}

function renderTasks(tasks: FairwayTask[], props: Partial<Parameters<typeof FairwayTasks>[0]> = {}) {
  return render(
    <FairwayTasks
      role={COACH_ROLE}
      teamId="team-1"
      tasks={tasks}
      stats={baseStats}
      players={[]}
      today={TODAY}
      onRefetch={vi.fn()}
      {...props}
    />,
  );
}

describe('FairwayTasks — one clock, one predicate', () => {
  it('labels a task due today "Today" and does NOT call it overdue', () => {
    renderTasks([makeTask({ due_date: TODAY, assignments: assigned('p1', 'Ana', 'Ruiz') })]);

    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-slot="verdict"]')?.textContent).toContain('Nothing overdue.');
  });

  it('labels a task due tomorrow "Tomorrow", never colliding with today', () => {
    renderTasks([makeTask({ due_date: '2026-09-11' })]);
    expect(screen.getAllByText('Tomorrow').length).toBeGreaterThan(0);
  });

  it('names the worst offender in the masthead and shows the SAME figure on its lane', () => {
    renderTasks([
      makeTask({ id: 't1', title: 'Range block', due_date: '2026-09-01', assignments: assigned('p-ana', 'Ana', 'Ruiz') }),
      makeTask({ id: 't2', title: 'Gym', due_date: '2026-09-08', assignments: assigned('p-bo', 'Bo', 'Chen') }),
    ]);

    const verdict = document.querySelector('[data-slot="verdict"]');
    expect(verdict?.textContent).toContain('2 tasks overdue.');
    expect(verdict?.textContent).toContain('Ana Ruiz');
    expect(verdict?.textContent).toContain('is furthest behind, 9 days late on "Range block."');

    // The stage carries the same number, because both call one function.
    const field = document.querySelector('[data-slot="due-field"]');
    expect(field?.textContent).toContain('9d late');
    expect(field?.textContent).toContain('2d late');
  });

  it('links the named player to their roster page and nothing else in the sentence', () => {
    renderTasks([
      makeTask({ id: 't1', title: 'Range block', due_date: '2026-09-01', assignments: assigned('p-ana', 'Ana', 'Ruiz') }),
    ]);
    const verdict = document.querySelector('[data-slot="verdict"]');
    const links = verdict?.querySelectorAll('a') ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/golf/dashboard/roster/p-ana');
  });

  it('never borrows a name for a team-wide overdue task', () => {
    renderTasks([makeTask({ id: 't1', title: 'Turn in forms', due_date: '2026-09-01', assignments: [] })]);
    const verdict = document.querySelector('[data-slot="verdict"]');
    expect(verdict?.textContent).toContain('all team-wide with no single assignee to flag');
    expect(verdict?.querySelectorAll('a')).toHaveLength(0);
  });

  it('gives work nobody owns its own terminal lane on the stage', () => {
    renderTasks([makeTask({ id: 't1', title: 'Turn in forms', due_date: '2026-09-01', assignments: [] })]);
    const field = document.querySelector('[data-slot="due-field"]');
    expect(field?.textContent).toContain('Team-wide, no assignee');
  });
});

describe('FairwayTasks — missing facts in precedence', () => {
  it('a load error outranks the list and quotes no number', () => {
    renderTasks([makeTask({ due_date: '2026-09-01' })], { error: 'boom' });
    const verdict = document.querySelector('[data-slot="verdict"]');
    expect(verdict?.textContent).toBe("Couldn't load tasks.");
    expect(screen.getByText("Couldn't load tasks")).toBeInTheDocument();
    // The stage, ledger and table must not render alongside a failed read.
    expect(document.querySelector('[data-slot="due-field"]')).toBeNull();
    expect(document.querySelector('[data-slot="tasks-ledger"]')).toBeNull();
  });

  it('an empty list outranks a zero count', () => {
    renderTasks([]);
    expect(document.querySelector('[data-slot="verdict"]')?.textContent).toBe('No tasks yet.');
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
  });

  it('says so when open work exists but nothing carries a due date', () => {
    renderTasks([makeTask({ due_date: null, assignments: assigned('p-ana', 'Ana', 'Ruiz') })]);
    expect(screen.getByText(/No open task carries a due date yet/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="due-field"]')).toBeNull();
    // …and the readout says the exclusion out loud, next to the ledger column
    // that holds the same tasks. Same word, same set, same number: the two are
    // one fact at two grains, never two independent counts.
    const readouts = document.querySelector('[data-slot="field-readouts"]') as HTMLElement;
    expect(within(readouts).getByText('No due date')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No due date' })).toBeInTheDocument();
  });
});

describe('FairwayTasks — the ledger row', () => {
  it('lists the overdue tasks worst-first with their days late', () => {
    renderTasks([
      makeTask({ id: 't1', title: 'Range block', description: 'Wedges', due_date: '2026-09-09' }),
      makeTask({ id: 't2', title: 'Gym', description: 'Lower body', due_date: '2026-08-01' }),
    ]);
    const overdue = screen.getByRole('heading', { name: 'Overdue now' }).parentElement as HTMLElement;
    const titles = within(overdue).getAllByRole('button').map((b) => b.textContent);
    expect(titles).toEqual(['Gym', 'Range block']);
    expect(overdue.textContent).toContain('40d');
    expect(overdue.textContent).toContain('1d');
  });

  it('never offers an affordance that would open an empty panel', () => {
    // A bare task carries no description, no reminder and no assignees, so its
    // detail would be blank; the title stays plain text rather than a button.
    renderTasks([makeTask({ id: 't1', title: 'Range block', due_date: '2026-09-09' })]);
    const overdue = screen.getByRole('heading', { name: 'Overdue now' }).parentElement as HTMLElement;
    expect(within(overdue).queryAllByRole('button')).toHaveLength(0);
    expect(overdue.textContent).toContain('Range block');
  });

  it('narrows the table to one category when its ledger row is picked', async () => {
    const user = userEvent.setup();
    renderTasks([
      makeTask({ id: 't1', title: 'Range block', category: 'Practice' }),
      makeTask({ id: 't2', title: 'Weigh in', category: 'Fitness' }),
    ]);

    const table = () => document.querySelector('[data-slot="tasks-ledger"]');
    expect(table()?.textContent).toContain('Weigh in');

    const byCategory = screen.getByRole('heading', { name: 'By category' }).parentElement as HTMLElement;
    await user.click(within(byCategory).getByRole('button', { name: /Practice/ }));

    expect(table()?.textContent).toContain('Range block');
    expect(table()?.textContent).not.toContain('Weigh in');
  });

  it('lists open undated tasks where the stage cannot show them', () => {
    renderTasks([makeTask({ id: 't1', title: 'Order shirts', due_date: null })]);
    const column = screen.getByRole('heading', { name: 'No due date' }).parentElement;
    expect(column?.textContent).toContain('Order shirts');
    expect(column?.textContent).toContain('team-wide');
  });
});

describe('FairwayTasks — responsive branches and the manage menu', () => {
  it('keeps BOTH table branches in the DOM so CSS alone chooses', () => {
    renderTasks([makeTask({ due_date: TODAY })]);
    expect(document.querySelector('[data-slot="tasks-list-compact"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="tasks-ledger"]')).not.toBeNull();
  });

  it('opens a visible manage menu when the per-task kebab is clicked (#88)', async () => {
    const user = userEvent.setup();
    renderTasks([makeTask({ title: 'Film 9 holes' })]);

    const kebab = screen.getByRole('button', { name: /manage task: film 9 holes/i });
    expect(screen.queryByText('Set reminder')).not.toBeInTheDocument();

    await user.click(kebab);

    // Radix Popover doesn't require role="dialog"; the items mounting IS "the
    // menu opened" from a user's perspective.
    expect(await screen.findByText('Set reminder')).toBeInTheDocument();
    expect(screen.getByText('Delete task')).toBeInTheDocument();
  });

  it('opens one detail panel at a time, from the row that was clicked', async () => {
    const user = userEvent.setup();
    renderTasks([makeTask({ id: 't1', title: 'Range block', description: 'Bring a wedge', due_date: TODAY })]);

    expect(screen.queryByText('Bring a wedge')).not.toBeInTheDocument();

    const table = document.querySelector('[data-slot="tasks-ledger"]') as HTMLElement;
    await user.click(within(table).getByRole('button', { name: 'Range block' }));

    // Both responsive branches of the table expand the same row, since CSS —
    // not a runtime breakpoint read — decides which one the viewer sees. The
    // stage's own detail slot stays closed: it was not the source.
    expect(within(table).getAllByText('Bring a wedge')).toHaveLength(1);
    expect(screen.getAllByText('Bring a wedge')).toHaveLength(2);
  });
});
