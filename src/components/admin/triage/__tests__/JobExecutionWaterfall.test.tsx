import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobExecutionWaterfall } from '@/components/admin/triage/JobExecutionWaterfall';
import type { JobWaterfallRow, JobWaterfallView } from '@/lib/admin/triage/job-waterfall';

function row(overrides: Partial<JobWaterfallRow> = {}): JobWaterfallRow {
  return {
    jobType: 'event-reminders',
    path: '/api/cron/event-reminders',
    cadenceMinutes: 60,
    checkInState: 'ok',
    lastRunAt: '2026-09-03T06:00:00.000Z',
    lastDurationMs: 1200,
    unreadable: false,
    runs: [{ startedAt: '2026-09-03T05:00:00.000Z', status: 'completed', durationMs: 1200, offsetMs: 0 }],
    ...overrides,
  };
}

function view(overrides: Partial<JobWaterfallView> = {}): JobWaterfallView {
  return {
    windowStartMs: Date.parse('2026-09-03T04:00:00.000Z'),
    windowEndMs: Date.parse('2026-09-03T06:30:00.000Z'),
    rows: [row()],
    unreadableJobs: [],
    ...overrides,
  };
}

describe('JobExecutionWaterfall', () => {
  it('renders one row per job with its check-in state', () => {
    render(<JobExecutionWaterfall view={view()} />);
    expect(screen.getByText('event-reminders')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows an explicit empty-board state, never a blank waterfall, when nothing has ever run', () => {
    render(<JobExecutionWaterfall view={view({ windowStartMs: null, rows: [] })} />);
    expect(screen.getByText(/No job in the board has ever recorded a run/i)).toBeInTheDocument();
  });

  it('marks a job with no run history honestly, not as a zero-run success', () => {
    render(<JobExecutionWaterfall view={view({ rows: [row({ runs: [] })] })} />);
    expect(screen.getByText(/no runs recorded/i)).toBeInTheDocument();
  });

  it('marks an unreadable job distinctly from one with no runs', () => {
    render(<JobExecutionWaterfall view={view({ rows: [row({ unreadable: true, runs: [] })] })} />);
    expect(screen.getByText(/unreadable/i)).toBeInTheDocument();
    expect(screen.queryByText(/no runs recorded/i)).not.toBeInTheDocument();
  });

  it('renders a degraded check-in state as its own word, not folded into ok or failed', () => {
    render(<JobExecutionWaterfall view={view({ rows: [row({ checkInState: 'degraded' })] })} />);
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });
});
