/**
 * Pure pg_cron / pg_net health evaluation (brief §26, §28).
 *
 * NO NEW TABLE — this module classifies whatever
 * `helm_debug_read_jobs_health()` (20260903190200_helm_debug_jobs_health_read.sql)
 * reads LIVE from `cron.job`/`cron.job_run_details`/`net.http_request_queue`/
 * `net._http_response` at request time. Same "pure evaluator, fixture
 * tested" convention as every other module in this directory.
 *
 * NO "CRITICAL APP CRON" REGISTRY EXISTS FOR PG_CRON JOBS — a decision this
 * file states rather than hides. The task brief's own phrasing ("critical
 * app cron failed / never ran") mirrors this repo's Vercel-cron
 * classification (`src/lib/admin/cron-registry.ts`), but that registry
 * describes VERCEL crons, not native `pg_cron.job` rows — and measured
 * production truth (docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md
 * §3) shows exactly ONE `cron.job` row exists today (a daily
 * admin_events/admin_analytics_events prune), with no metadata anywhere
 * marking it "critical" or not. Inventing a criticality tag with nothing to
 * back it would be exactly the kind of confident-but-fabricated claim
 * `.claude/rules/shipping.md` §1 warns about. So this evaluator reports
 * FINDINGS from evidence (never ran, abnormal duration, repeated failure,
 * stale relative to its own inferred cadence) uniformly for every
 * `cron.job` row, and leaves "which of these findings counts as critical
 * for MY deployment" to the Bridge reader/operator, not to a guess baked in
 * here.
 */

export type CronRunStatus = 'succeeded' | 'failed' | string;

export interface CronRunRecord {
  status: CronRunStatus;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
}

export interface CronJobRecord {
  jobId: number;
  jobName: string;
  schedule: string;
  active: boolean;
  /** Most-recent-first, up to 20 (the RPC's own bound). */
  recentRuns: readonly CronRunRecord[];
}

export type CronJobFinding =
  | 'never_run'
  | 'abnormal_duration'
  | 'repeated_failure'
  | 'last_run_failed'
  /** No run has landed within 2x this job's own inferred cadence — brief:
   *  "a collector with no run inside 2x its cadence is TELEMETRY_DEFECT,
   *  never green." Distinct from `never_run` (zero evidence ever) — this is
   *  "evidence exists but has gone stale". */
  | 'telemetry_defect';

export interface CronJobEvaluation {
  jobId: number;
  jobName: string;
  findings: CronJobFinding[];
  medianDurationMs: number | null;
  lastRunStatus: CronRunStatus | null;
}

const REPEATED_FAILURE_MIN_CONSECUTIVE = 2;
const ABNORMAL_DURATION_MULTIPLIER = 3;
const STALE_CADENCE_MULTIPLIER = 2;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
}

/**
 * Recognizes only the handful of standard 5-field cron shapes this repo
 * actually uses (every-N-minutes, every-N-hours, a fixed daily time) and
 * returns `null` for anything else — NEVER a guessed cadence for a pattern
 * this cannot confidently parse (e.g. day-of-week/day-of-month
 * restrictions), because a wrong inferred cadence would produce a false
 * `telemetry_defect`.
 */
export function inferCronCadenceMinutes(schedule: string): number | null {
  const trimmed = schedule.trim();

  const everyNMinutes = trimmed.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyNMinutes) return Number(everyNMinutes[1]);

  const everyNHours = trimmed.match(/^\d{1,2} \*\/(\d+) \* \* \*$/);
  if (everyNHours) return Number(everyNHours[1]) * 60;

  const dailyAtTime = trimmed.match(/^\d{1,2} \d{1,2} \* \* \*$/);
  if (dailyAtTime) return 24 * 60;

  return null;
}

export function evaluateCronJob(job: CronJobRecord, now: Date): CronJobEvaluation {
  const findings: CronJobFinding[] = [];

  if (job.recentRuns.length === 0) {
    findings.push('never_run');
    return { jobId: job.jobId, jobName: job.jobName, findings, medianDurationMs: null, lastRunStatus: null };
  }

  const durations = job.recentRuns.map((r) => r.durationMs).filter((d): d is number => d !== null);
  const medianDurationMs = median(durations);
  const latest = job.recentRuns[0] as CronRunRecord;

  if (medianDurationMs !== null && medianDurationMs > 0 && latest.durationMs !== null && latest.durationMs > medianDurationMs * ABNORMAL_DURATION_MULTIPLIER) {
    findings.push('abnormal_duration');
  }

  if (latest.status !== 'succeeded') {
    findings.push('last_run_failed');
  }

  let consecutiveFailures = 0;
  for (const run of job.recentRuns) {
    if (run.status === 'succeeded') break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures >= REPEATED_FAILURE_MIN_CONSECUTIVE) {
    findings.push('repeated_failure');
  }

  const cadenceMinutes = inferCronCadenceMinutes(job.schedule);
  if (cadenceMinutes !== null && latest.startTime) {
    const ageMinutes = (now.getTime() - new Date(latest.startTime).getTime()) / 60_000;
    if (ageMinutes > cadenceMinutes * STALE_CADENCE_MULTIPLIER) {
      findings.push('telemetry_defect');
    }
  }

  return { jobId: job.jobId, jobName: job.jobName, findings, medianDurationMs, lastRunStatus: latest.status };
}

// --- pg_net (brief §28) ---------------------------------------------------

export type NetCapability = 'available' | 'unavailable';

export interface NetResponseBucket {
  statusCode: number | null;
  hasError: boolean;
  responseCount: number;
}

export interface PgNetHealth {
  queueDepth: number | null;
  queueCapability: NetCapability;
  responseBuckets: readonly NetResponseBucket[];
  responsesCapability: NetCapability;
}

export type PgNetFinding = 'backlog_anomaly' | 'elevated_error_rate';

/** Judgment call: a queue this deep suggests pg_net is not draining, not a
 *  measured Supabase limit. */
export const NET_BACKLOG_WARNING = 100;
/** Judgment call: share of 24h responses carrying an error before it is
 *  worth a finding. */
export const NET_ERROR_RATE_WARNING = 0.1;
/** Below this many total 24h responses, an error-rate fraction is noise
 *  (1 error out of 2 responses is not "10%+ error rate" in any meaningful
 *  sense). */
export const NET_ERROR_RATE_MIN_TOTAL = 10;

export function evaluatePgNetHealth(health: PgNetHealth): PgNetFinding[] {
  const findings: PgNetFinding[] = [];

  if (health.queueCapability === 'available' && health.queueDepth !== null && health.queueDepth >= NET_BACKLOG_WARNING) {
    findings.push('backlog_anomaly');
  }

  if (health.responsesCapability === 'available') {
    const total = health.responseBuckets.reduce((sum, b) => sum + b.responseCount, 0);
    const errors = health.responseBuckets.filter((b) => b.hasError).reduce((sum, b) => sum + b.responseCount, 0);
    if (total >= NET_ERROR_RATE_MIN_TOTAL && errors / total >= NET_ERROR_RATE_WARNING) {
      findings.push('elevated_error_rate');
    }
  }

  return findings;
}
