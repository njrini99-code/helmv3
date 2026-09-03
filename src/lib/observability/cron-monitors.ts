/**
 * Sentry Cron Monitor check-ins for every scheduled job this codebase runs —
 * Vercel crons via `recordJobRun` (job-log.ts), Inngest functions
 * (functions.ts), and the launchd Self-Heal Repair job
 * (scripts/run-selfheal-repair.mjs).
 *
 * WHY THIS EXISTS. Phase A found `automaticVercelMonitors: true` configured
 * but structurally inert (the withSentryConfig argument-position bug fixed
 * separately — see sentry-build-options.mjs), and zero manual
 * `captureCheckIn`/`withMonitor` call sites anywhere in the repo. The result:
 * "a job that never runs at all" — Vercel's scheduler silently failing to
 * invoke it, the deployment paused, or a crash before `recordJobRun`'s own
 * try/catch even starts — had NO detection mechanism. `recordJobRun` already
 * catches a job that runs and fails; it had nothing for a job that simply
 * goes silent, which is exactly the case a Sentry Cron Monitor's missed
 * check-in alert exists for.
 *
 * FAIL-OPEN, ALWAYS. A check-in is diagnostic infrastructure ABOUT the job,
 * never part of it — every exported function here is wrapped so a Sentry
 * outage, a malformed monitor slug, or any other internal failure can never
 * throw into the caller's job. Same discipline as metrics.ts/spans.ts.
 *
 * MONITOR SLUG. `api-cron-<path segments>` — the cron route path with
 * slashes turned into dashes, e.g. `/api/cron/log-retention` ->
 * `api-cron-log-retention`. For a jobType that has no CRON_REGISTRY entry
 * (an Inngest function id, a launchd job, or a route not wired into
 * vercel.json — see docs/observability/SENTRY_CRON_MONITORS.md for the
 * current list), the slug falls back to `<prefix>-<jobType>` so every job
 * still gets a stable, collision-resistant slug even without a registered
 * path.
 *
 * MONITOR CONFIG. Only attached when the jobType resolves to a real
 * CRON_REGISTRY entry — inventing a crontab schedule for a job that isn't
 * actually Vercel-scheduled (an Inngest function, a launchd job, a
 * manually-triggered route, or a sub-step like `selfheal-close` that runs
 * inside another job's single invocation) would tell Sentry to expect a
 * cadence nothing guarantees, producing false "missed check-in" alerts. Those
 * jobs still check in — Sentry just doesn't second-guess when the next one
 * should arrive.
 *
 * GATING. Skipped by default outside a real Vercel production/preview
 * deployment (test runs, CI, a laptop `next dev`) so a local test run never
 * writes fake monitor history into the shared Sentry project. Force on with
 * HELM_SENTRY_CRON_CHECKINS=true to rehearse against a real project.
 */
import * as Sentry from '@sentry/nextjs';
import { CRON_REGISTRY } from '@/lib/admin/cron-registry';
import { getRuntimeEnv } from '@/lib/telemetry-gate';

/** Sane defaults when a job has no better basis for either value. */
const DEFAULT_CHECKIN_MARGIN_MINUTES = 5;
const DEFAULT_MAX_RUNTIME_MINUTES = 30;

export type CronCheckInStatus = 'ok' | 'error';

// Derived from the installed SDK's own captureCheckIn signature rather than
// naming `Sentry.MonitorConfig` directly — the type is exported deep in
// @sentry/core's re-export chain and this survives that chain moving.
type CronMonitorConfig = NonNullable<Parameters<typeof Sentry.captureCheckIn>[1]>;

/**
 * Whether check-ins should actually be emitted right now.
 *
 * Exported so callers/tests can assert the gate directly without having to
 * fake a whole captureCheckIn call.
 */
export function shouldEmitCronCheckIns(): boolean {
  if (process.env.HELM_SENTRY_CRON_CHECKINS === 'true') return true;
  const runtimeEnv = getRuntimeEnv();
  // getRuntimeEnv() already treats vitest/local/CI runs as 'dev' or 'ci'
  // (see telemetry-gate.ts) — reusing it here means this gate can never drift
  // from the same test/dev classification the rest of the Bridge pipeline
  // already trusts.
  return runtimeEnv === 'production' || runtimeEnv === 'preview';
}

/**
 * `/api/cron/log-retention` -> `api-cron-log-retention`.
 * A jobType with no matching path (Inngest function id, launchd job, an
 * unregistered route) becomes `job-<jobType>` instead — still stable, still
 * unique, never collides with a real path-derived slug (no real path segment
 * is ever literally `job`).
 */
export function resolveCronMonitorSlug(jobType: string): string {
  const entry = CRON_REGISTRY.find((e) => e.jobType === jobType);
  if (!entry) return `job-${jobType}`;
  return entry.path.replace(/^\/+/, '').replace(/\/+/g, '-');
}

/**
 * A crontab-schedule MonitorConfig for a jobType with a real CRON_REGISTRY
 * entry; `undefined` otherwise (see the "MONITOR CONFIG" note above for why
 * that is deliberate, not a gap).
 */
export function resolveCronMonitorConfig(jobType: string): CronMonitorConfig | undefined {
  const entry = CRON_REGISTRY.find((e) => e.jobType === jobType);
  if (!entry) return undefined;
  return {
    schedule: { type: 'crontab', value: entry.schedule },
    checkinMargin: DEFAULT_CHECKIN_MARGIN_MINUTES,
    maxRuntime: DEFAULT_MAX_RUNTIME_MINUTES,
    timezone: 'UTC',
  };
}

/**
 * Start a check-in for `jobType`. Returns the check-in id to pass to
 * `finishCronCheckIn`, or `null` when check-ins are gated off or the SDK call
 * itself failed — `finishCronCheckIn` treats `null` as a no-op, so callers
 * never need their own gating logic.
 *
 * NEVER THROWS.
 */
export function startCronCheckIn(jobType: string): string | null {
  if (!shouldEmitCronCheckIns()) return null;
  try {
    const monitorSlug = resolveCronMonitorSlug(jobType);
    const monitorConfig = resolveCronMonitorConfig(jobType);
    return Sentry.captureCheckIn({ monitorSlug, status: 'in_progress' }, monitorConfig);
  } catch {
    return null;
  }
}

/**
 * Finish a check-in started by `startCronCheckIn`. A `null` checkInId
 * (check-ins gated off, or the start call itself failed) is a silent no-op —
 * callers can unconditionally call this in a `finally`-shaped block without
 * their own branching.
 *
 * NEVER THROWS.
 */
export function finishCronCheckIn(
  jobType: string,
  checkInId: string | null,
  status: CronCheckInStatus,
  durationMs?: number,
): void {
  if (!checkInId) return;
  try {
    const monitorSlug = resolveCronMonitorSlug(jobType);
    Sentry.captureCheckIn({
      monitorSlug,
      status,
      checkInId,
      ...(durationMs !== undefined ? { duration: durationMs / 1000 } : {}),
    });
  } catch {
    // Diagnostic infrastructure about the job must never affect the job.
  }
}
