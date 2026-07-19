/**
 * ============================================================================
 * FairwayTeamInfo — "My tasks" widget: priority + overdue coherence (#161/#172)
 * ----------------------------------------------------------------------------
 * #161 — the widget must show the same HIGH/MEDIUM priority flag the
 *   canonical Tasks page shows for the identical underlying task.
 * #172 — the widget must visually flag an overdue task the same way the
 *   canonical Tasks page / Team Hub Tasks tab do: a StatusPill "Overdue".
 * Both assertions render the SAME task list a real caller would pass (from
 * the /dashboard/team page loader) — no fabricated props shape.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { FairwayTeamInfo, type FairwayTeamInfoProps } from './FairwayTeamInfo';

function baseProps(
  tasks: NonNullable<FairwayTeamInfoProps['tasks']>,
): FairwayTeamInfoProps {
  return {
    team: { id: 't1', name: 'Wildcats Golf', season: '2026', created_at: '2020-01-01T00:00:00.000Z' },
    coach: { full_name: 'Coach Davis', avatar_url: null },
    roster: [],
    announcements: [],
    tasks,
  };
}

describe('FairwayTeamInfo — My tasks widget', () => {
  it('shows a HIGH priority pill on a high-priority pending task (#161)', () => {
    render(
      <FairwayTeamInfo
        {...baseProps([
          {
            id: 'task-1',
            title: 'Submit physical form',
            description: null,
            due_date: '2099-01-01',
            status: 'pending',
            priority: 'high',
          },
        ])}
      />,
    );

    expect(screen.getByText(/high/i)).toBeInTheDocument();
  });

  it('flags a past-due, incomplete task with an "Overdue" pill (#172)', async () => {
    render(
      <FairwayTeamInfo
        {...baseProps([
          {
            id: 'task-2',
            title: 'Return uniform',
            description: null,
            due_date: '2000-01-01', // deep in the past — deterministic overdue
            status: 'pending',
            priority: 'medium',
          },
        ])}
      />,
    );

    await waitFor(() => expect(screen.getByText('Overdue')).toBeInTheDocument());
  });

  it('does NOT flag a future-due task as overdue', () => {
    render(
      <FairwayTeamInfo
        {...baseProps([
          {
            id: 'task-3',
            title: 'Turn in itinerary',
            description: null,
            due_date: '2099-01-01',
            status: 'pending',
            priority: 'medium',
          },
        ])}
      />,
    );

    expect(screen.queryByText('Overdue')).toBeNull();
  });

  it('does not flag a completed task as overdue even with a past due date', () => {
    render(
      <FairwayTeamInfo
        {...baseProps([
          {
            id: 'task-4',
            title: 'Old completed task',
            description: null,
            due_date: '2000-01-01',
            status: 'completed',
            priority: 'medium',
          },
        ])}
      />,
    );

    expect(screen.queryByText('Overdue')).toBeNull();
  });
});
