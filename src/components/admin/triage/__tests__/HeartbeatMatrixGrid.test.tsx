import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeartbeatMatrixGrid } from '@/components/admin/triage/HeartbeatMatrixGrid';
import type { HeartbeatRow } from '@/lib/admin/triage/heartbeat-matrix';

function row(overrides: Partial<HeartbeatRow> = {}): HeartbeatRow {
  return {
    jobType: 'event-reminders',
    path: '/api/cron/event-reminders',
    cadenceMinutes: 60,
    cells: [
      { windowStartMs: 0, windowEndMs: 1, state: 'completed', durationMs: 500 },
      { windowStartMs: 1, windowEndMs: 2, state: 'missed', durationMs: null },
    ],
    unreadable: false,
    ...overrides,
  };
}

describe('HeartbeatMatrixGrid', () => {
  it('renders one row per job', () => {
    render(<HeartbeatMatrixGrid view={{ windowCount: 2, rows: [row()] }} />);
    expect(screen.getByText('event-reminders')).toBeInTheDocument();
  });

  it('renders an honest empty state when there are no registered jobs', () => {
    render(<HeartbeatMatrixGrid view={{ windowCount: 12, rows: [] }} />);
    expect(screen.getByText(/No registered jobs to show/i)).toBeInTheDocument();
  });

  it('renders the declared number of cells per row', () => {
    const { container } = render(
      <HeartbeatMatrixGrid view={{ windowCount: 2, rows: [row()] }} />,
    );
    const cells = container.querySelectorAll('[title]');
    // 2 cells for the one row (title attrs on the cell spans).
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });
});
