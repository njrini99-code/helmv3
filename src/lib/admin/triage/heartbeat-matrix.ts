/**
 * Heartbeat Matrix (Bridge Premium Phase 3, `/admin/health`).
 *
 * "Rows = critical jobs, columns = expected windows, cells = completed /
 * failed / missed / running / unknown." `data/jobs.ts`'s `fetchJobsTab()`
 * already reads everything this needs — `CronBoardRow.recentRuns` (oldest ->
 * newest, real timestamps) and each job's own `cadenceMinutes` — no new I/O.
 *
 * This is deliberately a DIFFERENT projection of the same board
 * `job-waterfall.ts` reads for `/admin/jobs`'s Execution Waterfall: that
 * module positions individual runs on one shared continuous timeline (real
 * bars, real durations — "what actually happened, run by run"); this module
 * buckets each job into ITS OWN expected-cadence windows ("is the heartbeat
 * rhythm intact"). Same source data, two honest questions, not a duplicated
 * model.
 *
 * MISSED VS UNKNOWN, NOT COLLAPSED. A window with no recorded run is
 * `'missed'` only when the window has fully elapsed (its end is in the
 * past) — a window still in progress with no run yet is `'unknown'`, not a
 * miss nobody has had the chance to avoid yet.
 */

import type { CronBoardRow, JobsTab } from '@/lib/admin/data/jobs';

export type HeartbeatCellState = 'completed' | 'failed' | 'running' | 'missed' | 'unknown';

export interface HeartbeatCell {
  windowStartMs: number;
  windowEndMs: number;
  state: HeartbeatCellState;
  /** The run's real duration, when one landed in this window. */
  durationMs: number | null;
}

export interface HeartbeatRow {
  jobType: string;
  path: string;
  cadenceMinutes: number;
  cells: readonly HeartbeatCell[];
  unreadable: boolean;
}

export interface HeartbeatMatrixView {
  windowCount: number;
  rows: readonly HeartbeatRow[];
}

function cellStateFor(run: { status: string } | null, windowEndMs: number, now: number): HeartbeatCellState {
  if (run) return run.status === 'failed' ? 'failed' : run.status === 'started' ? 'running' : 'completed';
  if (windowEndMs <= now) return 'missed';
  return 'unknown';
}

/**
 * Pure. `jobs` is `fetchJobsTab()`'s already-fetched result; `now` anchors
 * the trailing edge; `windowCount` bounds how many of a job's own cadence
 * windows are shown (default 12 — matches `RunHistoryHeatmap`'s convention
 * elsewhere on the self-heal page).
 */
export function buildHeartbeatMatrix(jobs: JobsTab, now: number, windowCount = 12): HeartbeatMatrixView {
  const unreadableSet = new Set(jobs.unreadableJobs);

  const rows: HeartbeatRow[] = jobs.board.map((row: CronBoardRow) => {
    const cadenceMs = row.cadenceMinutes * 60_000;
    const runsByWindowStart = new Map<number, { status: string; durationMs: number | null; startedAtMs: number }>();

    for (const run of row.recentRuns) {
      const t = Date.parse(run.startedAt);
      if (Number.isNaN(t)) continue;
      const windowStart = now - Math.ceil((now - t) / cadenceMs) * cadenceMs;
      // Multiple runs can land in one window (a job that fired twice before
      // its next expected slot) — the most recent one in that window wins,
      // since that is the run an operator would actually go look at.
      const existing = runsByWindowStart.get(windowStart);
      if (!existing || t > existing.startedAtMs) {
        runsByWindowStart.set(windowStart, { status: run.status, durationMs: run.durationMs, startedAtMs: t });
      }
    }

    const cells: HeartbeatCell[] = [];
    for (let i = windowCount - 1; i >= 0; i -= 1) {
      const windowEndMs = now - i * cadenceMs;
      const windowStartMs = windowEndMs - cadenceMs;
      const run = runsByWindowStart.get(windowStartMs) ?? null;
      cells.push({
        windowStartMs,
        windowEndMs,
        state: unreadableSet.has(row.jobType) ? 'unknown' : cellStateFor(run, windowEndMs, now),
        durationMs: run?.durationMs ?? null,
      });
    }

    return {
      jobType: row.jobType,
      path: row.path,
      cadenceMinutes: row.cadenceMinutes,
      cells,
      unreadable: unreadableSet.has(row.jobType),
    };
  });

  return { windowCount, rows };
}
