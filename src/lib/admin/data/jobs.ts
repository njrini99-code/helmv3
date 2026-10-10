import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertQueryOk } from '@/lib/admin/data/assert-query-ok';
import {
  CRON_REGISTRY,
  classifyCronStatus,
  type CronBoardStatus,
  type CronRegistryEntry,
} from '@/lib/admin/cron-registry';
import {
  SELFHEAL_STAGES,
  classifySelfHealStage,
  summarizeLoop,
  type SelfHealStageRow,
  type SelfHealLoopStatus,
} from '@/lib/admin/selfheal-registry';

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
  /** The error→diagnosis→repair→closure circuit, one row per stage. Two of
   *  its three runners live outside this deployment, so their only evidence of
   *  life is the heartbeat row they write — see `selfheal-registry.ts`. */
  selfHeal: SelfHealStageRow[];
  /** The loop's worst stage, in one word. `'unknown'` when any stage's history
   *  was unreadable — a failed read is never reported as a healthy loop. */
  selfHealStatus: SelfHealLoopStatus;
}

interface BackgroundJobLogRow {
  job_type: string;
  status: string;
  /** Carries `degraded: true` when a run finished but reported that part of
   *  its own work failed. Selected AND passed through — a status derived from
   *  a column the query never fetched is a status that never fires. */
  metadata: unknown;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
}

/** Runs kept per job for the recent-history strip / failure-rate summary. */
const RECENT_RUNS_PER_JOB = 20;

/** Only a title shaped exactly like this (written by
 *  src/app/api/cron/integrity-check/route.ts) is a real integrity-check
 *  result. Anything else sharing `source='integrity'` — currently
 *  integration-health.ts's reachability faults — is a different signal and
 *  must not be parsed as a check name. */
const INTEGRITY_TITLE_PATTERN = /^Integrity (?:PASS|FAIL): (.+) \(\d+\)$/;

/**
 * Latest result per real integrity check, newest-first input assumed (the
 * first occurrence per check name wins). Exported and pure so both bugs
 * fixed here (the nested-metadata read, and the source='integrity' name
 * collision with integration-health.ts) have a direct unit test against a
 * realistic row shape, without mocking Supabase.
 */
export function parseIntegrityRows(rows: readonly IntegrityEventRow[]): Map<string, IntegrityRow> {
  const latestIntegrity = new Map<string, IntegrityRow>();
  for (const row of rows) {
    const match = row.title.match(INTEGRITY_TITLE_PATTERN);
    if (!match) continue;
    const name = match[1]!;
    if (!latestIntegrity.has(name)) {
      latestIntegrity.set(name, {
        check: name,
        status: row.severity === 'info' ? 'pass' : 'fail',
        count: row.metadata?.metadata?.count ?? 0,
        lastRunAt: row.created_at,
        sample: row.metadata?.metadata?.sample ?? [],
      });
    }
  }
  return latestIntegrity;
}

interface IntegrityEventRow {
  title: string;
  severity: string;
  // The write path (src/app/api/cron/integrity-check/route.ts -> logServerEvent
  // -> writeAdminTables/normalizeContext in server-error-logger.ts) stores the
  // FULL context envelope in this column, with the caller's own `{count,
  // sample}` payload nested one level deeper at `metadata.metadata` —
  // normalizeContext always writes `metadata: context.metadata ?? {}` as ONE
  // field of the outer envelope it persists, it never IS the envelope. A flat
  // `{count, sample}` read here silently always finds `undefined` and falls
  // back to `0`/`[]`, masked today because every live integrity check passes
  // with count 0 anyway.
  metadata: { metadata?: { count?: number; sample?: unknown[] } } | null;
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

  // One bounded query PER job type (CRON_REGISTRY.length entries, each capped at
  // RECENT_RUNS_PER_JOB) instead of a single globally-ordered top-500 query.
  // The prior single-query shape let high-frequency crons (refresh-engagement
  // every 5min, event/task-reminders hourly) crowd low-frequency ones
  // (the 3 weekly jobs, any daily job idle >~1.5 days) entirely out of the
  // fetched window — those jobs then read "never-ran" (the neutral,
  // non-alarming status) even after actually failing days earlier. 18
  // parallel queries is the documented, migration-free fix (no window-
  // function RPC — no new migrations in this batch).
  const [
    jobRunsPerJob,
    integrityRows,
    adminEventsCount,
    errorLogsCount,
    jobLogsCount,
    selfHealRuns,
  ] = await Promise.all([
    Promise.all(
      CRON_REGISTRY.map((entry) =>
        admin
          .from('background_job_logs')
          .select('job_type, status, duration_ms, error_message, started_at, metadata')
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
    // One read per stage, same bounded shape as the cron board above. A stage
    // running daily would be crowded out of any globally-ordered window by the
    // 30-minute crons, and would then read "never-ran" — the neutral status —
    // while actually being days overdue.
    Promise.all(
      SELFHEAL_STAGES.map((stage) =>
        admin
          .from('background_job_logs')
          .select('job_type, status, duration_ms, error_message, started_at, metadata')
          .eq('job_type', stage.jobType)
          .order('started_at', { ascending: false })
          .limit(1),
      ),
    ),
  ]);

  // FAIL LOUDLY. None of these 20 results had its `.error` inspected, so a
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
      status: classifyCronStatus(entry, last ? { started_at: last.started_at, status: last.status, metadata: last.metadata } : null, now),
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

  const latestIntegrity = parseIntegrityRows((integrityRows.data ?? []) as IntegrityEventRow[]);

  // Self-healing stages. A stage whose read FAILED is marked unreadable and
  // never classified — `summarizeLoop` turns any unreadable stage into
  // `'unknown'` for the whole loop, because a circuit you could not inspect is
  // not a circuit you can call closed.
  const selfHeal: SelfHealStageRow[] = SELFHEAL_STAGES.map((stage, i) => {
    const result = selfHealRuns[i];
    const unreadable = Boolean(result?.error);
    const last = (result?.data?.[0] ?? null) as BackgroundJobLogRow | null;
    const status = unreadable
      ? ('never-ran' as const)
      : classifySelfHealStage(
          stage,
          last ? { started_at: last.started_at, status: last.status, metadata: last.metadata } : null,
          now,
        );
    // Same split, same reason as `data/selfheal.ts` — a completed run's
    // `error_message` is a note, not a fault. Applied here too because this
    // module builds the SAME `SelfHealStageRow` for the /admin/jobs panel, and
    // a split that only one of the two producers performs is a split that
    // stops holding the moment a reader switches tabs.
    const isFault = status === 'failed' || status === 'degraded';
    const freeText = last?.error_message ?? null;
    return {
      ...stage,
      status,
      lastRunAt: last?.started_at ?? null,
      lastRunStatus: last?.status ?? null,
      lastError: isFault ? freeText : null,
      lastNote: isFault ? null : freeText,
      unreadable,
    };
  });

  return {
    board,
    selfHeal,
    selfHealStatus: summarizeLoop(selfHeal),
    /** Job types whose run history could not be read — status is UNKNOWN for
     *  these, not "never ran". Empty in the normal case. */
    unreadableJobs,
    integrity: [...latestIntegrity.values()],
    logHealth: {
      adminEvents: adminEventsCount.count ?? 0,
      errorLogs: errorLogsCount.count ?? 0,
      jobLogs: jobLogsCount.count ?? 0,
    },
  };
}
