/** player-dashboard-parts — TasksCard. (The SG radar teaser was removed, OD-08.) */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TasksCard } from './player-dashboard-parts';
import type { ActionItem } from '@/app/golf/actions/dashboard-data';

/* ─────────────────────────────────────────────────────────────────────────
 * TasksCard — formerly TodayCard (Wave 3 player-home premium pass, Nick's
 * flagged element; then the DaySchedule wave removed the Action center).
 * ----------------------------------------------------------------------------
 * Deliberate contract change (390px screen baseline, 2026-09-27): Home had
 * two "Today" sections. The schedule card said "Nothing scheduled, a clear
 * day" while this card, also headed "Today", showed an overdue task. The
 * schedule card now owns the day's events; this card is "Tasks" and shows
 * only tasks, so it no longer renders an event row, no longer shows the
 * "Nothing scheduled" empty line, and links to the task list instead of the
 * calendar. The earlier invariants still hold: no restated "N thing(s)
 * need(s) you" preview row, and no link to the removed #action-center anchor.
 * ──────────────────────────────────────────────────────────────────────── */

const OPEN_TASK: ActionItem = {
  id: 't1',
  type: 'task',
  title: 'Submit round',
  date: '2026-07-30',
  overdue: false,
};

// dashboard-data.ts sends an overdue task as type 'deadline'.
const OVERDUE_TASK: ActionItem = {
  id: 't2',
  type: 'deadline',
  title: 'Update yardage book',
  date: '2026-07-20',
  overdue: true,
};

const ANNOUNCEMENT: ActionItem = {
  id: 'a1',
  type: 'announcement',
  title: 'Bus leaves at 6am',
  date: '2026-07-21',
};

describe('TasksCard — one task section, not a second "Today"', () => {
  it('is headed "Tasks", never "Today"', () => {
    render(<TasksCard actionItems={[OPEN_TASK]} />);

    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('leads with the overdue task and counts overdue tasks among the open ones', () => {
    render(<TasksCard actionItems={[OPEN_TASK, OVERDUE_TASK]} />);

    expect(screen.getByText('Update yardage book')).toBeInTheDocument();
    expect(screen.queryByText('Submit round')).not.toBeInTheDocument();
    expect(screen.getByText('Overdue · 2 open tasks')).toBeInTheDocument();
  });

  it('shows the next open task when nothing is overdue', () => {
    render(<TasksCard actionItems={[OPEN_TASK]} />);

    expect(screen.getByText('Submit round')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('does not present an announcement as a task', () => {
    render(<TasksCard actionItems={[ANNOUNCEMENT]} />);

    expect(screen.queryByText('Bus leaves at 6am')).not.toBeInTheDocument();
    expect(screen.getByText('No open tasks')).toBeInTheDocument();
  });

  it('shows one honest line when there are no tasks, never a schedule claim', () => {
    render(<TasksCard actionItems={[]} />);

    expect(screen.getByText('No open tasks')).toBeInTheDocument();
    expect(screen.queryByText(/nothing scheduled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/clear day/i)).not.toBeInTheDocument();
  });

  it('never renders the old "N thing(s) need(s) you" preview copy', () => {
    render(<TasksCard actionItems={[OPEN_TASK, OVERDUE_TASK]} />);

    expect(screen.queryByText(/things? needs? you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what needs you/i)).not.toBeInTheDocument();
  });
});

describe('TasksCard — links to the task list, never a stale in-page anchor', () => {
  it('renders an "All tasks" link with or without tasks', () => {
    const { unmount } = render(<TasksCard actionItems={[OPEN_TASK]} />);
    expect(screen.getByRole('link', { name: /all tasks/i })).toHaveAttribute('href', '/golf/dashboard/tasks');
    unmount();

    render(<TasksCard actionItems={[]} />);
    expect(screen.getByRole('link', { name: /all tasks/i })).toHaveAttribute('href', '/golf/dashboard/tasks');
  });

  it('never links to the removed #action-center anchor', () => {
    render(<TasksCard actionItems={[OPEN_TASK]} />);
    expect(screen.queryByRole('link', { name: /see details/i })).not.toBeInTheDocument();
  });
});
