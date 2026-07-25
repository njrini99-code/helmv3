export interface CronRegistryEntry {
  jobType: string;
  path: string;
  cadenceMinutes: number;
}

const DAILY = 24 * 60;
const WEEKLY = 7 * DAILY;

/** Code-defined cadence registry — the "expected" half of expected-vs-actual.
 *  MUST mirror vercel.json crons exactly (contract test enforces). */
export const CRON_REGISTRY: readonly CronRegistryEntry[] = [
  { jobType: 'coachhelm-validation', path: '/api/cron/coachhelm-validation', cadenceMinutes: 60 },
  { jobType: 'coachhelm-calibration', path: '/api/cron/coachhelm-calibration', cadenceMinutes: DAILY },
  { jobType: 'coachhelm-safety-net', path: '/api/cron/coachhelm-safety-net', cadenceMinutes: 30 },
  { jobType: 'coachhelm-insight-lifecycle', path: '/api/cron/coachhelm-insight-lifecycle', cadenceMinutes: DAILY },
  { jobType: 'coachhelm-roster-sweep', path: '/api/cron/coachhelm-roster-sweep', cadenceMinutes: DAILY },
  { jobType: 'event-reminders', path: '/api/cron/event-reminders', cadenceMinutes: 60 },
  { jobType: 'task-reminders', path: '/api/cron/task-reminders', cadenceMinutes: 60 },
  { jobType: 'v3-standing-refresh', path: '/api/cron/v3/standing-refresh', cadenceMinutes: DAILY },
  { jobType: 'v3-genome-nightly', path: '/api/cron/v3/genome-nightly', cadenceMinutes: DAILY },
  { jobType: 'v3-causality-attribute', path: '/api/cron/v3/causality-attribute', cadenceMinutes: DAILY },
  { jobType: 'v3-weekly-coach-email', path: '/api/cron/v3/weekly-coach-email', cadenceMinutes: WEEKLY },
  { jobType: 'v3-goal-suggestions-write', path: '/api/cron/v3/goal-suggestions-write', cadenceMinutes: DAILY },
  { jobType: 'v3-goal-suggestions-evaluate', path: '/api/cron/v3/goal-suggestions-evaluate', cadenceMinutes: DAILY },
  { jobType: 'integrity-check', path: '/api/cron/integrity-check', cadenceMinutes: DAILY },
  { jobType: 'log-retention', path: '/api/cron/log-retention', cadenceMinutes: DAILY },
  { jobType: 'admin-digest', path: '/api/cron/admin-digest', cadenceMinutes: DAILY },
  { jobType: 'refresh-engagement', path: '/api/cron/refresh-engagement', cadenceMinutes: 5 },
  { jobType: 'ingest-gmail-replies', path: '/api/cron/ingest-gmail-replies', cadenceMinutes: 30 },
] as const;

export type CronBoardStatus = 'ok' | 'overdue' | 'never-ran' | 'failed';

export function classifyCronStatus(
  entry: CronRegistryEntry,
  lastRun: { started_at: string; status: string } | null,
  now: Date,
): CronBoardStatus {
  if (!lastRun) return 'never-ran';
  if (lastRun.status === 'failed') return 'failed';
  const ageMinutes = (now.getTime() - new Date(lastRun.started_at).getTime()) / 60_000;
  return ageMinutes > entry.cadenceMinutes * 1.5 ? 'overdue' : 'ok';
}
