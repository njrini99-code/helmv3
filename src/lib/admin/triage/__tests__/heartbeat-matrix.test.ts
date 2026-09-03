import { describe, it, expect } from 'vitest';
import { buildHeartbeatMatrix } from '../heartbeat-matrix';
import type { CronBoardRow, JobsTab } from '@/lib/admin/data/jobs';

function row(overrides: Partial<CronBoardRow> = {}): CronBoardRow {
  return {
    schedule: '*/5 * * * *',
    jobType: 'event-reminders',
    path: '/api/cron/event-reminders',
    cadenceMinutes: 60,
    status: 'ok',
    lastRunAt: '2026-09-03T06:00:00.000Z',
    lastDurationMs: 1000,
    lastError: null,
    recentRuns: [],
    failureRate: null,
    ...overrides,
  };
}

function jobsTab(overrides: Partial<JobsTab> = {}): JobsTab {
  return {
    board: [row()],
    unreadableJobs: [],
    integrity: [],
    logHealth: { adminEvents: 0, errorLogs: 0, jobLogs: 0 },
    inngest: { status: 'activated', faultCode: null, faultLastSeenAt: null },
    selfHeal: [],
    selfHealStatus: 'ok',
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-03T06:00:00.000Z'); // exactly on an hourly boundary

describe('buildHeartbeatMatrix', () => {
  it('returns exactly windowCount cells per row, oldest to newest', () => {
    const view = buildHeartbeatMatrix(jobsTab(), NOW, 6);
    expect(view.rows[0]!.cells).toHaveLength(6);
    for (let i = 1; i < 6; i += 1) {
      expect(view.rows[0]!.cells[i]!.windowStartMs).toBeGreaterThan(view.rows[0]!.cells[i - 1]!.windowStartMs);
    }
  });

  it('a run that landed inside a window marks that window completed, with its real duration', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({ board: [row({ recentRuns: [{ startedAt: '2026-09-03T05:00:00.000Z', status: 'completed', durationMs: 850 }] })] }),
      NOW,
      3,
    );
    // Windows (hourly, ending at NOW=06:00): [03:00-04:00], [04:00-05:00], [05:00-06:00]
    const lastCell = view.rows[0]!.cells[2]!;
    expect(lastCell.windowEndMs).toBe(NOW);
    expect(lastCell.state).toBe('completed');
    expect(lastCell.durationMs).toBe(850);
  });

  it('an elapsed window with no run reads "missed", never silently healthy', () => {
    const view = buildHeartbeatMatrix(jobsTab({ board: [row({ recentRuns: [] })] }), NOW, 3);
    for (const cell of view.rows[0]!.cells) {
      expect(cell.state).toBe('missed');
    }
  });

  it('a failed run in a window reads "failed", never downgraded to missed or completed', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({ board: [row({ recentRuns: [{ startedAt: '2026-09-03T05:30:00.000Z', status: 'failed', durationMs: 200 }] })] }),
      NOW,
      3,
    );
    const lastCell = view.rows[0]!.cells[2]!;
    expect(lastCell.state).toBe('failed');
  });

  it('an in-progress run reads "running", distinct from completed', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({ board: [row({ recentRuns: [{ startedAt: '2026-09-03T05:45:00.000Z', status: 'started', durationMs: null }] })] }),
      NOW,
      3,
    );
    const lastCell = view.rows[0]!.cells[2]!;
    expect(lastCell.state).toBe('running');
  });

  it('an unreadable job reads every cell as unknown, never a fabricated "missed" alarm', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({ board: [row({ recentRuns: [] })], unreadableJobs: ['event-reminders'] }),
      NOW,
      3,
    );
    for (const cell of view.rows[0]!.cells) {
      expect(cell.state).toBe('unknown');
    }
    expect(view.rows[0]!.unreadable).toBe(true);
  });

  it('two runs landing in the same window keep only the most recent one', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({
        board: [
          row({
            recentRuns: [
              { startedAt: '2026-09-03T05:10:00.000Z', status: 'failed', durationMs: 100 },
              { startedAt: '2026-09-03T05:40:00.000Z', status: 'completed', durationMs: 500 },
            ],
          }),
        ],
      }),
      NOW,
      3,
    );
    const lastCell = view.rows[0]!.cells[2]!;
    expect(lastCell.state).toBe('completed');
    expect(lastCell.durationMs).toBe(500);
  });

  it('a malformed startedAt is skipped rather than crashing the row', () => {
    const view = buildHeartbeatMatrix(
      jobsTab({ board: [row({ recentRuns: [{ startedAt: 'not-a-date', status: 'completed', durationMs: 1 }] })] }),
      NOW,
      3,
    );
    expect(view.rows[0]!.cells).toHaveLength(3);
  });
});
