import 'server-only';

/**
 * Helm Bridge — Jobs & Webhooks: pg_cron + pg_net health (brief §26, §28,
 * §35F).
 *
 * Reads `public.helm_debug_read_jobs_health()` (20260903190200, HELD) — a
 * single live read over `cron.job`/`cron.job_run_details`/
 * `net.http_request_queue`/`net._http_response`, no stored table. Each of
 * the three sub-sections (cron, net queue, net responses) can independently
 * read `unavailable` (extension absent or unreadable) without the others —
 * this file maps that through as `capability` fields, never coercing an
 * unavailable section to an empty/green result. Classification itself
 * (`evaluateCronJob`, `evaluatePgNetHealth`) is pure and lives in
 * src/lib/observability/supabase/jobs-health.ts; see that file's header for
 * why there is no "critical app cron" tag — no registry exists to back one.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  evaluateCronJob,
  evaluatePgNetHealth,
  type CronJobEvaluation,
  type CronJobRecord,
  type CronRunRecord,
  type PgNetFinding,
  type NetCapability,
  type NetResponseBucket,
} from '@/lib/observability/supabase/jobs-health';

type MaybePostgrestError = { code?: string | null; message?: string | null } | null;

const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isMigrationNotAppliedError(error: MaybePostgrestError): boolean {
  if (!error) return false;
  if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
}

interface RawRunRow {
  status: string;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number | null;
  return_message: string;
}

interface RawJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  recent_runs: RawRunRow[];
}

interface RawResponseBucket {
  status_code: number | null;
  has_error: boolean;
  response_count: number;
}

interface RawJobsHealth {
  cron: RawJobRow[] | null;
  cron_capability: NetCapability;
  net_queue_depth: number | null;
  net_queue_capability: NetCapability;
  net_responses_24h: RawResponseBucket[] | null;
  net_responses_capability: NetCapability;
}

export interface CronJobDisplayRow extends CronJobEvaluation {
  schedule: string;
  active: boolean;
  recentRuns: readonly CronRunRecord[];
}

export interface JobsHealthSnapshot {
  cronCapability: NetCapability;
  cronJobs: CronJobDisplayRow[];
  netQueueDepth: number | null;
  netQueueCapability: NetCapability;
  netResponseBuckets: NetResponseBucket[];
  netResponsesCapability: NetCapability;
  netFindings: PgNetFinding[];
  notApplied: boolean;
}

function toRunRecord(raw: RawRunRow): CronRunRecord {
  return { status: raw.status, startTime: raw.start_time, endTime: raw.end_time, durationMs: raw.duration_ms };
}

export async function fetchJobsHealth(): Promise<AdminFetchResult<JobsHealthSnapshot>> {
  const admin = createAdminClient();

  const { data, error } = (await admin.rpc('helm_debug_read_jobs_health' as never, {} as never)) as {
    data: RawJobsHealth | null;
    error: MaybePostgrestError;
  };

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return unconfigured('jobs health RPC (migration HELD — see supabase/migrations/HELD.md)');
    }
    return failed(error.message ?? 'helm_debug_read_jobs_health failed');
  }

  if (!data) {
    return failed('helm_debug_read_jobs_health returned no data');
  }

  const now = new Date();

  const cronJobs: CronJobDisplayRow[] = (data.cron ?? []).map((raw) => {
    const record: CronJobRecord = {
      jobId: raw.jobid,
      jobName: raw.jobname,
      schedule: raw.schedule,
      active: raw.active,
      recentRuns: raw.recent_runs.map(toRunRecord),
    };
    const evaluation = evaluateCronJob(record, now);
    return { ...evaluation, schedule: raw.schedule, active: raw.active, recentRuns: record.recentRuns };
  });

  const netResponseBuckets: NetResponseBucket[] = (data.net_responses_24h ?? []).map((raw) => ({
    statusCode: raw.status_code,
    hasError: raw.has_error,
    responseCount: raw.response_count,
  }));

  const netFindings = evaluatePgNetHealth({
    queueDepth: data.net_queue_depth,
    queueCapability: data.net_queue_capability,
    responseBuckets: netResponseBuckets,
    responsesCapability: data.net_responses_capability,
  });

  return ok({
    cronCapability: data.cron_capability,
    cronJobs,
    netQueueDepth: data.net_queue_depth,
    netQueueCapability: data.net_queue_capability,
    netResponseBuckets,
    netResponsesCapability: data.net_responses_capability,
    netFindings,
    notApplied: false,
  });
}
