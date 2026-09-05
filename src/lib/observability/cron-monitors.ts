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
 * MONITOR CONFIG. Every check-in carries one — never omitted. The installed
 * SDK's own "upsert" behavior only creates/attaches a monitor when
 * `monitorConfig` is present on the check-in
 * (docs.sentry.io/product/monitors-and-alerts/monitors/crons/getting-started/http/:
 * "you can skip creating a monitor manually... and instead create or update
 * (upsert) a monitor through a check-in" — gated on including
 * `monitor_config` in the payload); Sentry's own docs do not state what
 * happens to a check-in for an unknown slug with NO config, and that
 * ambiguity is exactly the failure mode this file refuses to risk —
 * instrumentation that silently achieves nothing is worse than no
 * instrumentation, because it reports success. So a jobType with a real
 * `CRON_REGISTRY` entry gets its real crontab schedule; everything else (an
 * Inngest function id, a launchd job, a manually-triggered route, or a
 * sub-step like `selfheal-close` that runs inside another job's single
 * invocation) gets a deliberately GENEROUS fallback interval
 * (`FALLBACK_SCHEDULE_DAYS`) wide enough that no legitimate gap in usage
 * should ever trip a false "missed check-in" — it exists to guarantee the
 * monitor gets created and the check-in lands, not to assert a cadence
 * nothing guarantees.
 *
 * GATING. Skipped by default outside a real Vercel production/preview
 * deployment (test runs, CI, a laptop `next dev`) so a local test run never
 * writes fake monitor history into the shared Sentry project. Force on with
 * HELM_SENTRY_CRON_CHECKINS=true to rehearse against a real project.
 */
import * as Sentry from '@sentry/nextjs';
import { CRON_REGISTRY } from '@/lib/admin/cron-registry';
import { flushTelemetryNow } from './flush';
import { getRuntimeEnv } from '@/lib/telemetry-gate';

/** Sane defaults when a Vercel-scheduled job has no better basis for either value. */
const DEFAULT_CHECKIN_MARGIN_MINUTES = 5;
const DEFAULT_MAX_RUNTIME_MINUTES = 30;

/**
 * The fallback schedule for a jobType with no real CRON_REGISTRY cadence —
 * generous enough that no legitimate gap between runs of an event-triggered
 * or manually-triggered job should ever produce a false missed-check-in
 * alert, while still catching genuine total silence over a month.
 */
const FALLBACK_SCHEDULE_DAYS = 30;
const FALLBACK_CHECKIN_MARGIN_MINUTES = 60;
const FALLBACK_MAX_RUNTIME_MINUTES = 120;

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
 * A MonitorConfig for every jobType — never `undefined` (see the "MONITOR
 * CONFIG" note above for why omitting it is a real risk, not a style
 * choice). A jobType with a real `CRON_REGISTRY` entry gets its actual
 * crontab schedule; anything else gets the deliberately generous
 * `FALLBACK_SCHEDULE_DAYS` interval.
 */
export function resolveCronMonitorConfig(jobType: string): CronMonitorConfig {
  const entry = CRON_REGISTRY.find((e) => e.jobType === jobType);
  if (entry) {
    return {
      schedule: { type: 'crontab', value: entry.schedule },
      checkinMargin: DEFAULT_CHECKIN_MARGIN_MINUTES,
      maxRuntime: DEFAULT_MAX_RUNTIME_MINUTES,
      timezone: 'UTC',
    };
  }
  return {
    schedule: { type: 'interval', value: FALLBACK_SCHEDULE_DAYS, unit: 'day' },
    checkinMargin: FALLBACK_CHECKIN_MARGIN_MINUTES,
    maxRuntime: FALLBACK_MAX_RUNTIME_MINUTES,
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
 * DELIVERY IS PART OF THE CONTRACT, and this is the half that was missing.
 * `captureCheckIn` only BUFFERS an envelope; on Vercel the invocation returns
 * immediately afterwards and the instance freezes with the buffer unsent
 * unless something keeps it alive. The `in_progress` check-in survives that
 * by luck — the job's own work runs after it, and some other emitter's flush
 * carries it — but the terminal check-in is by construction the LAST thing
 * this invocation emits, so nothing comes along behind it. Measured in
 * production 2026-09-04: `api-cron-db-health-sampler` (every 5 minutes)
 * landed `in_progress` on essentially every run and its terminal check-in on
 * 1-4 runs in 12, and Sentry read the rest as `timeout` — ~95 false
 * "Cron failure" outage events in 19 hours for a job that never once failed
 * (`error=0`, `missed=0`, traces under a second, every hour of the window).
 *
 * `flushTelemetryNow` rather than `scheduleTelemetryFlush`, deliberately: the
 * latter drops a flush request while one is already in flight, and on the
 * FAILURE path below `recordJobRun` has just awaited a `logServerEvent`
 * write, so a flush is likely in flight and may already have drained the
 * buffer this envelope has not entered yet. See flush.ts for the full note.
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
    flushTelemetryNow();
  } catch {
    // Diagnostic infrastructure about the job must never affect the job.
  }
}
