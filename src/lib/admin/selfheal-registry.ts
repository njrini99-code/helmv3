/**
 * The self-healing loop, as a thing that can be watched.
 *
 * Production errors are supposed to travel a closed circuit: they are
 * CAPTURED into `admin_events`, DIAGNOSED into `rca_analysis` rows by a cloud
 * routine, REPAIRED into pull requests by a local routine running against the
 * real checkout, and CLOSED — with evidence — into `admin_error_resolutions`
 * by the nightly cron. Each stage is a different runner in a different place:
 * a Vercel cron, an Anthropic-hosted routine, and a launchd agent on the
 * owner's laptop.
 *
 * WHICH IS EXACTLY WHY THIS FILE EXISTS. Two of those three runners are
 * outside this deployment entirely — nothing in the app invokes them, nothing
 * in CI tests them, and neither raises an error anywhere the Bridge can see
 * when it stops running. A cloud routine that gets disabled and a local agent
 * whose plist was never `launchctl load`ed both fail the same way: silently,
 * by producing nothing. And "producing nothing" is indistinguishable from
 * "there was nothing to do" on a board that only shows errors.
 *
 * That is not hypothetical. On 2026-08-27 the repair half's launchd plist had
 * been written and installed for hours and never loaded — `launchctl list`
 * returned nothing for it — while every artifact around it (the plist on
 * disk, the routine definition, the contract doc) said the loop was running.
 * "Recorded" is not "applied", the same distinction `.claude/rules/shipping.md`
 * already draws for migrations.
 *
 * So each stage reports a heartbeat into `background_job_logs` under its own
 * `job_type`, and this registry is the expected half of expected-vs-actual —
 * the same shape, and the same `classifyCronStatus` logic, that
 * `cron-registry.ts` uses for the Vercel crons. A stage that stops running
 * goes OVERDUE on a board an operator already reads, instead of going quiet.
 *
 * Deliberately NOT merged into `CRON_REGISTRY`: that registry is contract-
 * tested to mirror `vercel.json` exactly, and two of these three stages have
 * no Vercel path to mirror. Folding them in would either break that contract
 * test or force it to be loosened — and it is the test that keeps the cron
 * board honest.
 */
import { classifyCronStatus, type CronBoardStatus } from '@/lib/admin/cron-registry';

/** Where a stage actually executes. The Bridge shows this, because "it is not
 *  running" has a completely different fix in each case: redeploy, re-enable
 *  the routine, or wake the laptop. */
export type SelfHealRunner = 'vercel-cron' | 'cloud-routine' | 'local-agent';

export const SELFHEAL_RUNNER_LABEL: Readonly<Record<SelfHealRunner, string>> = {
  'vercel-cron': 'Vercel cron',
  'cloud-routine': 'Cloud routine',
  'local-agent': 'Local agent',
};

export interface SelfHealStage {
  /** Stable id for tests and keys. */
  id: string;
  /** `background_job_logs.job_type` this stage writes its heartbeat under. */
  jobType: string;
  /** Ordinal position in the loop, 1-based — rendered so the circuit reads as
   *  a sequence rather than an unordered list of jobs. */
  step: number;
  title: string;
  runner: SelfHealRunner;
  cadenceMinutes: number;
  /** One line: what this stage does to move an incident forward. */
  what: string;
  /** The in-repo contract this stage follows. Every stage has one, and it is
   *  in git on purpose — see the header of `docs/ai-system/selfheal/README.md`
   *  for what happened when the contract lived only in routine config. */
  contract: string;
}

const DAILY = 24 * 60;

/**
 * Close's own heartbeat job type.
 *
 * It used to be `log-retention`, the cron that HOSTS the auto-resolve work.
 * That route deliberately fail-softs an auto-resolve failure so its
 * independent purge still runs, then returns 200 — so Close's work could fail
 * completely while this registry read a healthy heartbeat belonging to
 * different work. Exported so the route and the registry cannot drift apart on
 * the string that joins them.
 */
export const SELFHEAL_CLOSE_JOB_TYPE = 'selfheal-close';

export const SELFHEAL_STAGES: readonly SelfHealStage[] = [
  {
    id: 'triage',
    jobType: 'selfheal-triage',
    step: 1,
    title: 'Diagnose',
    runner: 'cloud-routine',
    cadenceMinutes: DAILY,
    what: 'Reads every unresolved fingerprint in the last 72h, groups them by root cause, and writes one rca_analysis row per fingerprint.',
    contract: 'docs/ai-system/selfheal/triage-contract.md',
  },
  {
    id: 'repair',
    jobType: 'selfheal-repair',
    step: 2,
    title: 'Repair',
    runner: 'local-agent',
    cadenceMinutes: DAILY,
    what: 'Takes the repairable analyses, reproduces each with a failing test, and opens a verified PR. Never merges, never deploys.',
    contract: 'docs/ai-system/selfheal/repair-contract.md',
  },
  {
    id: 'close',
    jobType: SELFHEAL_CLOSE_JOB_TYPE,
    step: 3,
    title: 'Close',
    runner: 'vercel-cron',
    cadenceMinutes: DAILY,
    what: 'Auto-resolves what a production deploy demonstrably fixed and records it in admin_error_resolutions, so a recurrence reads as a REGRESSION rather than a new bug.',
    contract: 'src/lib/admin/auto-resolve.ts',
  },
] as const;

export interface SelfHealStageRow extends SelfHealStage {
  status: CronBoardStatus;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  /** True when the run history for this job type could not be READ. Distinct
   *  from `never-ran`: one is "we looked and there is nothing", the other is
   *  "we could not look". Reporting the second as the first is the
   *  `unknown → healthy` move the engineering OS forbids. */
  unreadable: boolean;
}

/**
 * Classify one stage from its most recent heartbeat. Delegates to
 * `classifyCronStatus` rather than re-deriving the overdue rule: a second
 * definition of "how late is too late" is a second thing to drift.
 */
export function classifySelfHealStage(
  stage: SelfHealStage,
  lastRun: { started_at: string; status: string; metadata?: unknown } | null,
  now: Date,
): CronBoardStatus {
  return classifyCronStatus(
    { jobType: stage.jobType, path: stage.contract, cadenceMinutes: stage.cadenceMinutes },
    lastRun,
    now,
  );
}

export type SelfHealLoopStatus = CronBoardStatus | 'unknown';

/**
 * The loop's status in one word: its WORST stage.
 *
 * A circuit is only closed if every stage is running, so an average or a
 * majority would report a healthy-looking loop with a dead link in it — and a
 * dead link is the entire failure mode this registry was built to expose. An
 * unreadable stage returns `'unknown'`, never a status, for the same reason:
 * a read that failed is not evidence of anything.
 */
export function summarizeLoop(rows: readonly SelfHealStageRow[]): SelfHealLoopStatus {
  if (rows.length === 0) return 'unknown';
  if (rows.some((r) => r.unreadable)) return 'unknown';
  const order: readonly CronBoardStatus[] = ['failed', 'overdue', 'never-ran', 'ok'];
  for (const status of order) {
    if (rows.some((r) => r.status === status)) return status;
  }
  return 'ok';
}
