/**
 * ============================================================================
 * Dashboard Action Items ↔ Tasks page — due-date PARITY (round-2 gap closure)
 * ----------------------------------------------------------------------------
 * Round 1 of the tasks-residual package fixed the UTC-midnight-vs-local-day
 * due-date bug inside FairwayTasks.tsx (the card label, the masthead's "N due
 * today" count, and the overdue sort/tint all now agree with each other for
 * the same stored `due_date`). The adversarial re-review found the SAME class
 * of bug still live one surface over: `formatRelativeDate()` in
 * FairwayCoachDashboard.tsx (feeding `ActionItemsPanel`) still ran a raw
 * `new Date(dateStr)` over the identical date-only `due_date` string, so a
 * task due "today" could read "Today" on the Tasks page and "Yesterday" in
 * the Dashboard's Action Items panel for the EXACT SAME stored value.
 *
 * This suite proves the fix by rendering BOTH surfaces — FairwayTasks (the
 * Tasks-page card) and ActionItemsPanel (the Dashboard panel) — from the same
 * date-only `due_date` string, using the REAL system clock (no fake timers,
 * same pattern as FairwayTasks.render.test.tsx) so it holds in whatever
 * timezone actually runs it, and asserts they agree.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/golf/actions/tasks', () => ({
  deleteTask: vi.fn(async () => ({ success: true })),
  setTaskReminder: vi.fn(async () => ({ success: true })),
  clearTaskReminder: vi.fn(async () => ({ success: true })),
}));

import {
  FairwayTasks,
  type FairwayTask,
  type FairwayTaskStats,
} from '@/components/fairway/pages/tasks/FairwayTasks';
import { ActionItemsPanel } from './FairwayCoachDashboard';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

const baseStats: FairwayTaskStats = {
  total_tasks: 1,
  completed_tasks: 0,
  pending_tasks: 1,
  in_progress_tasks: 0,
  overdue_tasks: 0,
  completion_rate: 0,
};

/** Same helper as FairwayTasks.render.test.tsx — the bare "YYYY-MM-DD" shape
 * `createTask` stores, using the real system clock. */
function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// jsx-a11y/aria-role false-positives on a literal `role={COACH_ROLE}` (it reads
// the prop as an ARIA role attribute, not FairwayTasks's own `role` prop) —
// same workaround as FairwayTasks.render.test.tsx.
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

describe('Due-date parity — Tasks page vs Dashboard Action Items (same due_date)', () => {
  it('a task due "today" reads "Today" on the Tasks card AND in the Dashboard Action Items panel', async () => {
    const today = toDateOnly(new Date());

    const { unmount } = render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={[makeTask({ due_date: today })]}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );
    // Tasks-page card label.
    expect(await screen.findByText('Today')).toBeInTheDocument();
    unmount();

    const item: ActionItem = { id: 'task-1', type: 'task', title: 'Film 9 holes', date: today };
    render(<ActionItemsPanel items={[item]} />);
    // Dashboard Action Items relative-date label — must also say "Today",
    // never "Yesterday", for the identical stored due_date.
    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
  });

  it('a task due "tomorrow" reads "Tomorrow" on both surfaces, never colliding with Today', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toDateOnly(tomorrow);

    const { unmount } = render(
      <FairwayTasks
        role={COACH_ROLE}
        teamId="team-1"
        tasks={[makeTask({ due_date: tomorrowStr })]}
        stats={baseStats}
        players={[]}
        onRefetch={vi.fn()}
      />,
    );
    expect(await screen.findByText('Tomorrow')).toBeInTheDocument();
    unmount();

    const item: ActionItem = {
      id: 'task-1',
      type: 'deadline',
      title: 'Film 9 holes',
      date: tomorrowStr,
    };
    render(<ActionItemsPanel items={[item]} />);
    expect(await screen.findByText('Tomorrow')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });
});
