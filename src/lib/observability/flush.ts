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

/** Test-only: forget an in-flight flush so the next call schedules a fresh one. */
export function __resetTelemetryFlushForTests(): void {
  pending = null;
}
