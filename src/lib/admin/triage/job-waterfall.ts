/**
 * Execution Waterfall for cron/Inngest jobs (Bridge Premium Phase 3,
 * `/admin/jobs`).
 *
 * `data/jobs.ts`'s `fetchJobsTab()` already reads everything this needs —
 * `CronBoardRow.recentRuns` (oldest -> newest, up to 20 per job, real
 * `startedAt`/`status`/`durationMs`) and each row's `status` (the
 * `CronBoardStatus` five-state check-in read: ok / overdue / never-ran /
 * failed / degraded). This module does NOT query anything new; it is a PURE
 * projection of that same board into a shared-timeline shape a waterfall can
 * position bars against — one `windowStartMs`/`windowEndMs` for the whole
 * board, and each run's `offsetMs` from that start, so runs across jobs of
 * very different cadences (5-minute crons next to weekly ones) land on one
 * comparable axis instead of each row inventing its own.
 *
 * NEVER A FABRICATED WINDOW. `windowStartMs` is the oldest `startedAt`
 * actually present across every row's `recentRuns` — never a fixed "last
 * 24h" that would silently truncate a low-frequency job's history to
 * nothing, or a fixed "last 7d" that would pad a high-frequency job's row
 * with implied-but-unobserved empty space.
 */

import type { CronBoardRow, CronRunSummary, JobsTab } from '@/lib/admin/data/jobs';
import type { CronBoardStatus } from '@/lib/admin/cron-registry';

export interface JobWaterfallRun {
  startedAt: string;
  status: string;
  durationMs: number | null;
  /** ms from the board-wide window start — what the renderer positions a bar at. */
  offsetMs: number;
}

export interface JobWaterfallRow {
  jobType: string;
  path: string;
  cadenceMinutes: number;
  /** The five-state check-in read — never collapsed to a boolean. */
  checkInState: CronBoardStatus;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  /** True when this job's history could not be read this refresh — its
   *  `runs` is empty for that reason, not because it never ran. */
  unreadable: boolean;
  /** Oldest -> newest, positioned within the board-wide window. */
  runs: JobWaterfallRun[];
}

export interface JobWaterfallView {
  /** Null when no job in the board has ever recorded a run — an empty
   *  board, not a zero-width one. */
  windowStartMs: number | null;
  windowEndMs: number;
  rows: JobWaterfallRow[];
  unreadableJobs: readonly string[];
}

/** Pure. `jobs` is `fetchJobsTab()`'s already-fetched result; `now` is the
 *  window's right edge. */
export function buildJobWaterfall(jobs: JobsTab, now: number): JobWaterfallView {
  const unreadableSet = new Set(jobs.unreadableJobs);

  let windowStartMs: number | null = null;
  for (const row of jobs.board) {
    for (const run of row.recentRuns) {
      const t = Date.parse(run.startedAt);
      if (Number.isNaN(t)) continue;
      if (windowStartMs === null || t < windowStartMs) windowStartMs = t;
    }
  }

  const rows: JobWaterfallRow[] = jobs.board.map((row: CronBoardRow) => {
    const runs: JobWaterfallRun[] = row.recentRuns.map((run: CronRunSummary) => {
      const t = Date.parse(run.startedAt);
      const offsetMs = windowStartMs !== null && !Number.isNaN(t) ? Math.max(0, t - windowStartMs) : 0;
      return { startedAt: run.startedAt, status: run.status, durationMs: run.durationMs, offsetMs };
    });

    return {
      jobType: row.jobType,
      path: row.path,
      cadenceMinutes: row.cadenceMinutes,
      checkInState: row.status,
      lastRunAt: row.lastRunAt,
      lastDurationMs: row.lastDurationMs,
      unreadable: unreadableSet.has(row.jobType),
      runs,
    };
  });

  return {
    windowStartMs,
    windowEndMs: now,
    rows,
    unreadableJobs: jobs.unreadableJobs,
  };
}
