import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInngestConfigured } from '@/lib/inngest/client';
import { assertQueryOk } from '@/lib/admin/data/assert-query-ok';
import {
  CRON_REGISTRY,
  classifyCronStatus,
  type CronBoardStatus,
  type CronRegistryEntry,
} from '@/lib/admin/cron-registry';

export interface CronRunSummary {
  startedAt: string;
  status: string;
  durationMs: number | null;
}

export interface CronBoardRow extends CronRegistryEntry {
  status: CronBoardStatus;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  /** Oldest → newest, up to RECENT_RUNS_PER_JOB — feeds the small inline
   *  failure-rate strip. Empty array is the honest "never run" state. */
  recentRuns: CronRunSummary[];
  /** null when recentRuns is empty (never run) — distinct from a real 0/N. */
  failureRate: { failures: number; total: number } | null;
}

export interface IntegrityRow {
  check: string;
  status: 'pass' | 'fail';
  count: number;
  lastRunAt: string;
  sample: unknown[];
}

export interface LogHealth {
  adminEvents: number;
  errorLogs: number;
  jobLogs: number;
}

export interface JobsTab {
  board: CronBoardRow[];
  /** Job types whose run history could not be read. UNKNOWN, not "never ran". */
  unreadableJobs: string[];
  integrity: IntegrityRow[];
  logHealth: LogHealth;
  inngestActivated: boolean;
}

interface BackgroundJobLogRow {
  job_type: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
}

/** Runs kept per job for the recent-history strip / failure-rate summary. */
const RECENT_RUNS_PER_JOB = 20;

interface IntegrityEventRow {
  title: string;
  severity: string;
  metadata: { count?: number; sample?: unknown[] } | null;
  created_at: string;
}

/**
 * CALLER must have passed requireSuperAdmin(). Reads go through
 * createAdminClient() (service role) against plain tables — no
 * auth.uid()-gated RPC involved here (that restriction is specific to the
 * get_admin_*_rollup functions, see golf.ts).
 */
export async function fetchJobsTab(): Promise<JobsTab> {
  const admin = createAdminClient();
  const now = new Date();

  // One bounded query PER job type (18 registry entries, each capped at
  // RECENT_RUNS_PER_JOB) instead of a single globally-ordered top-500 query.
  // The prior single-query shape let high-frequency crons (refresh-engagement
  // every 5min, event/task-reminders hourly) crowd low-frequency ones
  // (the 3 weekly jobs, any daily job idle >~1.5 days) entirely out of the
  // fetched window — those jobs then read "never-ran" (the neutral,
  // non-alarming status) even after actually failing days earlier. 18
  // parallel queries is the documented, migration-free fix (no window-
  // function RPC — no new migrations in this batch).
  const [jobRunsPerJob, integrityRows, adminEventsCount, errorLogsCount, jobLogsCount] = await Promise.all([
    Promise.all(
      CRON_REGISTRY.map((entry) =>
        admin
          .from('background_job_logs')
          .select('job_type, status, duration_ms, error_message, started_at')
          .eq('job_type', entry.jobType)
          .order('started_at', { ascending: false })
          .limit(RECENT_RUNS_PER_JOB),
      ),
    ),
    admin
      .from('admin_events')
      .select('title, severity, metadata, created_at')
      .eq('source', 'integrity')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('admin_events').select('id', { count: 'exact', head: true }),
    admin.from('error_logs').select('id', { count: 'exact', head: true }),
    admin.from('background_job_logs').select('id', { count: 'exact', head: true }),
  ]);

  // FAIL LOUDLY. None of these 21 results had its `.error` inspected, so a
  // statement timeout on the two exact-count scans over the 92-94k-row
  // admin_events/error_logs tables turned the whole board into 17 benign grey
  // "awaiting first run" chips plus a "0 admin_events" tile — a positive claim
  // that logging itself is dead, presented as fact. classifyCronStatus's own
  // comment calls never-ran "the neutral, non-alarming status", which is
  // exactly the wrong thing to show for a failed read. JobsBody already
  // renders inside a PanelBoundary, so a throw degrades this one panel.
  assertQueryOk(integrityRows, 'jobs.integrity');
  assertQueryOk(adminEventsCount, 'jobs.adminEventsCount');
  assertQueryOk(errorLogsCount, 'jobs.errorLogsCount');
  assertQueryOk(jobLogsCount, 'jobs.jobLogsCount');

  // Per-job reads degrade individually rather than taking the board down: one
  // unreadable job must not hide the other sixteen. But it is NAMED, not
  // silently rendered as "never ran".
  const unreadableJobs: string[] = [];
  CRON_REGISTRY.forEach((entry, i) => {
    if (jobRunsPerJob[i]?.error) unreadableJobs.push(entry.jobType);
  });

  const board: CronBoardRow[] = CRON_REGISTRY.map((entry, i) => {
    // Newest-first from the query above.
    const runs = (jobRunsPerJob[i]?.data ?? []) as BackgroundJobLogRow[];
    const last = runs[0] ?? null;
    const failures = runs.filter((r) => r.status === 'failed').length;
    return {
      ...entry,
      status: classifyCronStatus(entry, last ? { started_at: last.started_at, status: last.status } : null, now),
      lastRunAt: last?.started_at ?? null,
      lastDurationMs: last?.duration_ms ?? null,
      lastError: last?.error_message ?? null,
      // Oldest → newest, matching the Sparkline/detail-strip convention used
      // elsewhere in Bridge.
      recentRuns: [...runs].reverse().map((r) => ({
        startedAt: r.started_at,
        status: r.status,
        durationMs: r.duration_ms,
      })),
      failureRate: runs.length > 0 ? { failures, total: runs.length } : null,
    };
  });

  // Latest per check: admin_events rows are titled
  // `Integrity PASS: <check> (<count>)` / `Integrity FAIL: <check> (<count>)`
  // by the integrity-check cron. Rows are already newest-first from the
  // query above, so the first occurrence per check name wins.
  const latestIntegrity = new Map<string, IntegrityRow>();
  for (const row of (integrityRows.data ?? []) as IntegrityEventRow[]) {
    const name = row.title.replace(/^Integrity (PASS|FAIL): /, '').replace(/ \(\d+\)$/, '');
    if (!latestIntegrity.has(name)) {
      latestIntegrity.set(name, {
        check: name,
        status: row.severity === 'info' ? 'pass' : 'fail',
        count: row.metadata?.count ?? 0,
        lastRunAt: row.created_at,
        sample: row.metadata?.sample ?? [],
      });
    }
  }

  return {
    board,
    /** Job types whose run history could not be read — status is UNKNOWN for
     *  these, not "never ran". Empty in the normal case. */
    unreadableJobs,
    integrity: [...latestIntegrity.values()],
    logHealth: {
      adminEvents: adminEventsCount.count ?? 0,
      errorLogs: errorLogsCount.count ?? 0,
      jobLogs: jobLogsCount.count ?? 0,
    },
    // 2026-07-25: single source of truth moved to isInngestConfigured()
    // (src/lib/inngest/client.ts) so this board and the golf round-submit
    // routing branch can't silently drift onto two different booleans.
    inngestActivated: isInngestConfigured(),
  };
}
