/**
 * Post-emit telemetry flush for serverless runtimes.
 *
 * Live certification of the Sentry umbrella (preview deploy, 2026-09-03) showed
 * server spans arriving in Sentry while the `helm.*` metrics and `helmLog`
 * lines emitted by the same request never did. Spans are flushed by the
 * SDK's own route/page wrappers; a `'use server'` action or a plain server
 * helper has no such wrapper, so the Vercel function froze with the metric
 * and log buffers still in memory.
 *
 * `scheduleTelemetryFlush()` registers ONE `Sentry.flush()` with the Vercel
 * request context (`waitUntil`) per burst of emits. It is called from the
 * low-level emitters in `metrics.ts` and `structured-log.ts`, so every
 * `recordWorkflow`/`recordAuth`/`recordPush`/`recordDbFailure`/`helmLog.*`
 * call implies delivery without each call site knowing about it. Outside
 * Vercel (tests, local dev, scripts) `vercelWaitUntil` finds no request
 * context and the flush promise simply runs detached. Never throws.
 */
import * as Sentry from '@sentry/nextjs';
import { vercelWaitUntil } from './vercel-wait-until';

/** Upper bound for one flush; Vercel keeps the function alive at most this long extra. */
export const TELEMETRY_FLUSH_TIMEOUT_MS = 2000;

let pending: Promise<unknown> | null = null;

export function scheduleTelemetryFlush(): void {
  if (pending) return; // one in-flight flush covers every emit that raced it
  try {
    const task = Promise.resolve()
      .then(() => Sentry.flush(TELEMETRY_FLUSH_TIMEOUT_MS))
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
    pending = task;
    vercelWaitUntil(task);
  } catch {
    pending = null;
  }
}

/**
 * Flush for a TERMINAL emit — the last envelope an invocation will ever
 * produce.
 *
 * `scheduleTelemetryFlush` above deduplicates on the assumption that "one
 * in-flight flush covers every emit that raced it". That holds for the
 * high-frequency emitters it serves (`metrics.ts`, `structured-log.ts`),
 * where another emit — and therefore another flush — is almost always still
 * coming. It is exactly FALSE for the last envelope of a request:
 * `Sentry.flush()` drains what is buffered when it RUNS, so an emit that
 * lands after an already-in-flight flush has drained is covered by nothing,
 * and the serverless instance freezes with it still in memory.
 *
 * Measured in production 2026-09-04 on the only cron frequent enough to make
 * this visible. `api-cron-db-health-sampler` (every 5 minutes) delivered its
 * `in_progress` check-in on essentially every run and its TERMINAL check-in
 * on 1-4 runs out of 12 per hour; Sentry's monitor read the other 8-11 as
 * `timeout` — ~95 "Cron failure" outage events in 19 hours for a job whose
 * own traces show it finishing in under a second, with `error=0` and
 * `missed=0` across every hour in the window. The job was never failing.
 * Only the envelope saying so was being dropped.
 *
 * So this variant NEVER dedupes, and it is not an alternative spelling of
 * `scheduleTelemetryFlush`: use it only where a call site emits once, at the
 * very end, and the emit must not be lost. Using it per-emit would schedule
 * a flush per metric and give back the debounce that exists for good reason.
 */
export function flushTelemetryNow(): void {
  try {
    const task = Promise.resolve()
      .then(() => Sentry.flush(TELEMETRY_FLUSH_TIMEOUT_MS))
      .catch(() => undefined);
    vercelWaitUntil(task);
  } catch {
    // Delivering a diagnostic must never throw into the work it describes.
  }
}

/** Test-only: forget an in-flight flush so the next call schedules a fresh one. */
export function __resetTelemetryFlushForTests(): void {
  pending = null;
}
