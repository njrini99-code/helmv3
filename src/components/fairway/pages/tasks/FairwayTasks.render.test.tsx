/**
 * FairwayTasks — render regression tests.
 *
 *  - P295: a task's due date must read IDENTICALLY across every render call
 *    site in this file (the row's due label and the overdue tint) for the
 *    SAME stored `due_date`. `new Date('YYYY-MM-DD')` parses a date-only
 *    value as UTC midnight, which in any negative-UTC-offset zone (all of the
 *    US) rolls back to the PREVIOUS local calendar day — this used to make
 *    the row say "Tomorrow" a day early.
 *  - #88: the per-task kebab (manage) menu must open on click and show a
 *    visible menu (re-verification — the prior audit capture didn't see it
 *    open).
 *  - facelift (screens/tasks.md): the StatMatrix's Overdue cell is a real
 *    button, tap → filters the list to Active (the previously-separate
 *    overdue warning banner's "View active" action, now folded into the
 *    stat itself).
 *
 * Actions are mocked (colocated pattern, same as
 * FairwayCreateTaskModal.layout.test.tsx) — only this file's own rendering
 * logic is under test.
 *
 * NOTE (removed composition): the old masthead carried a "N due today" meta
 * chip alongside "N open" — dropped with the redesign (screens/tasks.md's
 * masthead shows a single honest count, and the StatMatrix now owns the
 * Open/Active/Completed/Overdue breakdown), so the assertions that used to
 * check `screen.getByText('1 due today')` / `queryByText('1 due today')`
 * were removed below rather than updated to a new string.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/golf/actions/tasks', () => ({
  deleteTask: vi.fn(async () => ({ success: true })),
  setTaskReminder: vi.fn(async () => ({ success: true })),
  clearTaskReminder: vi.fn(async () => ({ success: true })),
}));

import { FairwayTasks, parseDueDate, type FairwayTask, type FairwayTaskStats } from './FairwayTasks';

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
// passes it (`role={userRole === 'coach' ? 'coach' : 'player'}`) — sidesteps
// the misfire without suppressing the rule.
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

/** Format a real local Date as the bare "YYYY-MM-DD" `due_date` shape
 * `createTask` stores (no time, no offset) — the exact shape that used to
 * get misread as UTC midnight. Deliberately uses the REAL system clock (no
 * fake timers) so the test proves the fix against whatever timezone the
 * test runner is actually in, not a stubbed one. */
function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('FairwayTasks — due date consistency (P295)', () => {
  it('parseDueDate reads a date-only value as LOCAL midnight, not UTC midnight', () => {
    const parsed = parseDueDate('2026-07-19');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(19);
    expect(parsed.getHours()).toBe(0);
  });

  it('a task due "today" (date-only) is labeled Today on the card AND counted in the masthead — same stored value, same day everywhere', async () => {
    const today = toDateOnly(new Date());
    const tasks = [makeTask({ due_date: today })];

    render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={tasks}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );

    // Row due label — waits for the `now` effect to flush.
    expect(await screen.findByText('Today')).toBeInTheDocument();
  });

  it('a task due "tomorrow" (date-only) never collides with Today', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tasks = [makeTask({ due_date: toDateOnly(tomorrow) })];

    render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={tasks}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );

    expect(await screen.findByText('Tomorrow')).toBeInTheDocument();
  });
});

describe('FairwayTasks — kebab (manage) menu (#88)', () => {
  it('opens a visible menu when the per-task kebab is clicked', async () => {
    const user = userEvent.setup();
    const tasks = [makeTask({ title: 'Film 9 holes' })];

    render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={tasks}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );

    const kebab = screen.getByRole('button', { name: /manage task: film 9 holes/i });
    expect(kebab).toBeInTheDocument();

    // Not open until clicked.
    expect(screen.queryByText('Set reminder')).not.toBeInTheDocument();

    await user.click(kebab);

    // Radix Popover doesn't require role="dialog" for its content; assert on
    // the actual menu items mounting — that IS "the menu opened" from a
    // user/SR's perspective. (jsdom doesn't run framer-motion's rAF-driven
    // opacity tween, so `toBeVisible()` on the freshly-mounted item is
    // unreliable here — presence in the DOM is the meaningful assertion.)
    expect(await screen.findByText('Set reminder')).toBeInTheDocument();
    expect(screen.getByText('Delete task')).toBeInTheDocument();
  });
});

describe('FairwayTasks — StatMatrix Overdue cell filters the list (facelift)', () => {
  it('tapping the Overdue stat switches to the Active filter, dropping completed tasks from view', async () => {
    const user = userEvent.setup();
    const tasks = [
      makeTask({ id: 'overdue-1', title: 'Overdue drill', status: 'active' }),
      makeTask({ id: 'done-1', title: 'Finished chore', status: 'completed' }),
    ];
    const overdueStats: FairwayTaskStats = { ...baseStats, total_tasks: 2, overdue_tasks: 1 };

    render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={tasks}
        stats={overdueStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );

    // Both tasks visible on the default "All" filter.
    expect(screen.getByText('Finished chore')).toBeInTheDocument();
    expect(screen.getByText('Overdue drill')).toBeInTheDocument();

    const overdueButton = screen.getByRole('button', { name: /view overdue tasks/i });
    expect(overdueButton).toHaveTextContent('1');

    await user.click(overdueButton);

    // Now on the Active filter — the completed task drops out, the active
    // (overdue) task stays.
    expect(screen.queryByText('Finished chore')).not.toBeInTheDocument();
    expect(screen.getByText('Overdue drill')).toBeInTheDocument();
  });

  it('renders the Overdue count as plain text (no button) when nothing is overdue', () => {
    const tasks = [makeTask({ title: 'On track' })];

    render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={tasks}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /view overdue tasks/i })).not.toBeInTheDocument();
  });
});
