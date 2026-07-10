import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CRON_REGISTRY,
  classifyCronStatus,
  type CronBoardStatus,
  type CronRegistryEntry,
} from '@/lib/admin/cron-registry';

export interface CronBoardRow extends CronRegistryEntry {
  status: CronBoardStatus;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
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

  const [jobRows, integrityRows, adminEventsCount, errorLogsCount, jobLogsCount] = await Promise.all([
    admin
      .from('background_job_logs')
      .select('job_type, status, duration_ms, error_message, started_at')
      .order('started_at', { ascending: false })
      .limit(500),
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

  const latestByJob = new Map<string, BackgroundJobLogRow>();
  for (const row of (jobRows.data ?? []) as BackgroundJobLogRow[]) {
    if (row.started_at && !latestByJob.has(row.job_type)) {
      latestByJob.set(row.job_type, row);
    }
  }

  const board: CronBoardRow[] = CRON_REGISTRY.map((entry) => {
    const last = latestByJob.get(entry.jobType) ?? null;
    return {
      ...entry,
      status: classifyCronStatus(entry, last ? { started_at: last.started_at, status: last.status } : null, now),
      lastRunAt: last?.started_at ?? null,
      lastDurationMs: last?.duration_ms ?? null,
      lastError: last?.error_message ?? null,
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
    integrity: [...latestIntegrity.values()],
    logHealth: {
      adminEvents: adminEventsCount.count ?? 0,
      errorLogs: errorLogsCount.count ?? 0,
      jobLogs: jobLogsCount.count ?? 0,
    },
    inngestActivated: Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY),
  };
}
