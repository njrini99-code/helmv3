export interface CronRegistryEntry {
  jobType: string;
  path: string;
  cadenceMinutes: number;
  /**
   * The raw 5-field crontab expression from vercel.json, verbatim — the
   * source Sentry Cron Monitor check-ins (src/lib/observability/cron-monitors.ts)
   * build their `MonitorConfig.schedule` from. Contract-tested for an exact
   * string match against vercel.json, not just the derived cadenceMinutes —
   * see cron-registry.test.ts for why a looser check already missed a drift
   * once (refresh-engagement, 48x).
   */
  schedule: string;
}

const DAILY = 24 * 60;

/** Code-defined cadence registry — the "expected" half of expected-vs-actual.
 *  MUST mirror vercel.json crons exactly (contract test enforces). */
export const CRON_REGISTRY: readonly CronRegistryEntry[] = [
  { jobType: 'coachhelm-validation', path: '/api/cron/coachhelm-validation', cadenceMinutes: 60, schedule: '15 * * * *' },
  { jobType: 'coachhelm-calibration', path: '/api/cron/coachhelm-calibration', cadenceMinutes: DAILY, schedule: '40 3 * * *' },
  { jobType: 'coachhelm-safety-net', path: '/api/cron/coachhelm-safety-net', cadenceMinutes: 30, schedule: '*/30 * * * *' },
  { jobType: 'coachhelm-insight-lifecycle', path: '/api/cron/coachhelm-insight-lifecycle', cadenceMinutes: DAILY, schedule: '0 4 * * *' },
  { jobType: 'coachhelm-roster-sweep', path: '/api/cron/coachhelm-roster-sweep', cadenceMinutes: DAILY, schedule: '0 2 * * *' },
  { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60, schedule: '0 * * * *' },
  { jobType: 'task-reminders', path: '/api/cron/task-reminders', cadenceMinutes: 60, schedule: '0 * * * *' },
  { jobType: 'v3-standing-refresh', path: '/api/cron/v3/standing-refresh', cadenceMinutes: DAILY, schedule: '20 2 * * *' },
  { jobType: 'v3-genome-nightly', path: '/api/cron/v3/genome-nightly', cadenceMinutes: DAILY, schedule: '40 2 * * *' },
  { jobType: 'v3-causality-attribute', path: '/api/cron/v3/causality-attribute', cadenceMinutes: DAILY, schedule: '0 3 * * *' },
  { jobType: 'v3-goal-suggestions-write', path: '/api/cron/v3/goal-suggestions-write', cadenceMinutes: DAILY, schedule: '20 3 * * *' },
  { jobType: 'v3-goal-suggestions-evaluate', path: '/api/cron/v3/goal-suggestions-evaluate', cadenceMinutes: DAILY, schedule: '20 4 * * *' },
  { jobType: 'integrity-check', path: '/api/cron/integrity-check', cadenceMinutes: DAILY, schedule: '0 7 * * *' },
  { jobType: 'log-retention', path: '/api/cron/log-retention', cadenceMinutes: DAILY, schedule: '30 7 * * *' },
  { jobType: 'admin-digest', path: '/api/cron/admin-digest', cadenceMinutes: DAILY, schedule: '0 11 * * *' },
  // vercel.json schedules this "10 */4 * * *" — every 4 hours, not 5 minutes.
  // The 5-minute value survived here because the contract test below only
  // ever diffed the SET of paths between this file and vercel.json, never
  // cadenceMinutes against the actual schedule string — see that test for
  // the fix. At 5 min, classifyCronStatus's 1.5x-cadence overdue threshold
  // (7.5 min) made the Jobs board show this job "overdue" almost
  // continuously between its real, on-schedule 4-hour runs.
  { jobType: 'refresh-engagement', path: '/api/cron/refresh-engagement', cadenceMinutes: 4 * 60, schedule: '10 */4 * * *' },
  { jobType: 'ingest-gmail-replies', path: '/api/cron/ingest-gmail-replies', cadenceMinutes: 30, schedule: '*/30 * * * *' },
  { jobType: 'helm-debug-prune', path: '/api/cron/helm-debug-prune', cadenceMinutes: DAILY, schedule: '30 4 * * *' },
  // Supabase zero-cost observability Phase 1 (#1786): schedules mirror vercel.json byte-for-byte.
  { jobType: 'db-health-sampler', path: '/api/cron/db-health-sampler', cadenceMinutes: 5, schedule: '*/5 * * * *' },
  { jobType: 'db-stat-delta', path: '/api/cron/db-stat-delta', cadenceMinutes: 15, schedule: '*/15 * * * *' },
  { jobType: 'db-observability-prune', path: '/api/cron/db-observability-prune', cadenceMinutes: DAILY, schedule: '45 4 * * *' },
  // vercel.json schedules this "0 */3 * * *" — every 3 hours, hence 180. Read
  // the refresh-engagement note above before touching either half: the cadence
  // and the cron string are two encodings of one fact, and they have already
  // drifted apart once at exactly this spot.
  { jobType: 'reliability-triage', path: '/api/cron/reliability-triage', cadenceMinutes: 3 * 60, schedule: '0 */3 * * *' },
  // vercel.json schedules this "17 3,9,15,21 * * *" — four evenly-spaced
  // fires a day, 6 hours apart, with the 09:17 UTC one placed 83 minutes
  // before Repair's 10:40 UTC fire (see selfheal-registry.ts / the Diagnose
  // contract). This is the SAME job_type SELFHEAL_STAGES' 'triage' entry
  // uses — the route writes one row, and both the Jobs board and the
  // Self-heal circuit read it.
  { jobType: 'selfheal-triage', path: '/api/cron/selfheal-triage', cadenceMinutes: 6 * 60, schedule: '17 3,9,15,21 * * *' },
] as const;

/**
 * Operator status for one scheduled job.
 *
 * `degraded` means the run FINISHED but reported that part of its own work
 * failed — HTTP <400, status='completed', and `metadata.degraded === true`.
 * `log-retention` is the case this was added for: it catches an
 * autoResolveFixedIncidents() failure, still does the independent retention
 * half, returns 200, and records `degraded: true`. Its own comment says
 * "`degraded` carries the honest signal instead of the status code" — and
 * nothing read it, because `classifyCronStatus`'s parameter type had no
 * metadata in scope. Self-Heal's Close stage reads that same heartbeat, so
 * Close's work could fail while the circuit showed OK.
 */
export type CronBoardStatus = 'ok' | 'overdue' | 'never-ran' | 'failed' | 'degraded';

export function classifyCronStatus(
  // Narrowed to just the field this function actually reads, deliberately —
  // callers (and this file's own tests) that construct a plain literal don't
  // need to supply `schedule`, which exists for Sentry Cron Monitor check-ins
  // (cron-monitors.ts) and plays no part in classifying board status.
  entry: Pick<CronRegistryEntry, 'cadenceMinutes'>,
  lastRun: { started_at: string; status: string; metadata?: unknown } | null,
  now: Date,
): CronBoardStatus {
  if (!lastRun) return 'never-ran';
  if (lastRun.status === 'failed') return 'failed';
  const ageMinutes = (now.getTime() - new Date(lastRun.started_at).getTime()) / 60_000;
  if (ageMinutes > entry.cadenceMinutes * 1.5) return 'overdue';
  // `degraded` only ever replaces what would have been 'ok'. A failed run
  // still reads `failed` and a stale one still reads `overdue`, so nothing
  // that already reported a problem is downgraded — this can only stop a
  // green row from lying, never soften a red one.
  return isDegradedRun(lastRun.metadata) ? 'degraded' : 'ok';
}

/**
 * Only an explicit boolean `true` counts.
 *
 * Absent metadata is not degraded — it is a row written before the field
 * existed, and reinterpreting history is how a board starts reporting
 * problems nobody had. A string, number or object is malformed, and guessing
 * from it would invent a status the writer never claimed.
 */
function isDegradedRun(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).degraded === true;
}
