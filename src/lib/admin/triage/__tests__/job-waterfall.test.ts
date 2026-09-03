import { describe, it, expect } from 'vitest';
import { buildJobWaterfall } from '../job-waterfall';
import type { CronBoardRow, JobsTab } from '@/lib/admin/data/jobs';

function row(overrides: Partial<CronBoardRow> = {}): CronBoardRow {
  return {
    jobType: 'event-reminders',
    path: '/api/cron/event-reminders',
    cadenceMinutes: 60,
    status: 'ok',
    lastRunAt: '2026-09-03T06:00:00.000Z',
    lastDurationMs: 1200,
    lastError: null,
    recentRuns: [
      { startedAt: '2026-09-03T04:00:00.000Z', status: 'completed', durationMs: 1000 },
      { startedAt: '2026-09-03T05:00:00.000Z', status: 'completed', durationMs: 1100 },
      { startedAt: '2026-09-03T06:00:00.000Z', status: 'completed', durationMs: 1200 },
    ],
    failureRate: { failures: 0, total: 3 },
    ...overrides,
  };
}

function jobsTab(overrides: Partial<JobsTab> = {}): JobsTab {
  return {
    board: [row()],
    unreadableJobs: [],
    integrity: [],
    logHealth: { adminEvents: 1, errorLogs: 1, jobLogs: 1 },
    inngest: { status: 'activated', faultCode: null, faultLastSeenAt: null },
    selfHeal: [],
    selfHealStatus: 'ok',
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-03T06:30:00.000Z');

describe('buildJobWaterfall', () => {
  it('positions every run relative to the earliest startedAt across the whole board', () => {
    const view = buildJobWaterfall(jobsTab(), NOW);
    expect(view.windowStartMs).toBe(Date.parse('2026-09-03T04:00:00.000Z'));
    expect(view.rows[0]!.runs.map((r) => r.offsetMs)).toEqual([0, 60 * 60_000, 2 * 60 * 60_000]);
  });

  it('carries the five-state check-in read through unchanged, never collapsed to a boolean', () => {
    const view = buildJobWaterfall(jobsTab({ board: [row({ status: 'degraded' })] }), NOW);
    expect(view.rows[0]!.checkInState).toBe('degraded');
  });

  it('a job with an empty run history reports zero runs, not a fabricated one', () => {
    const view = buildJobWaterfall(jobsTab({ board: [row({ recentRuns: [] })] }), NOW);
    expect(view.rows[0]!.runs).toEqual([]);
  });

  it('marks an unreadable job explicitly, distinct from a job that genuinely never ran', () => {
    const view = buildJobWaterfall(
      jobsTab({
        board: [row({ jobType: 'log-retention', recentRuns: [], status: 'never-ran' })],
        unreadableJobs: ['log-retention'],
      }),
      NOW,
    );
    expect(view.rows[0]!.unreadable).toBe(true);
    expect(view.unreadableJobs).toEqual(['log-retention']);
  });

  it('a job that read cleanly but never ran is not marked unreadable', () => {
    const view = buildJobWaterfall(jobsTab({ board: [row({ recentRuns: [], status: 'never-ran' })] }), NOW);
    expect(view.rows[0]!.unreadable).toBe(false);
  });

  it('windowStartMs is null when no job in the board has ever recorded a run', () => {
    const view = buildJobWaterfall(jobsTab({ board: [row({ recentRuns: [] })] }), NOW);
    expect(view.windowStartMs).toBeNull();
  });

  it('every run offset is non-negative even with an out-of-order or malformed timestamp', () => {
    const view = buildJobWaterfall(
      jobsTab({
        board: [
          row({
            recentRuns: [
              { startedAt: '2026-09-03T04:00:00.000Z', status: 'completed', durationMs: 1000 },
              { startedAt: 'not-a-date', status: 'completed', durationMs: 500 },
            ],
          }),
        ],
      }),
      NOW,
    );
    expect(view.rows[0]!.runs.every((r) => r.offsetMs >= 0)).toBe(true);
  });

  it('windowEndMs is always the passed-in now, even with no runs', () => {
    const view = buildJobWaterfall(jobsTab({ board: [] }), NOW);
    expect(view.windowEndMs).toBe(NOW);
  });
});
