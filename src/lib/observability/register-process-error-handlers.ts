import * as Sentry from '@sentry/nextjs';
import { logServerException } from '@/lib/server-error-logger';
import { withBoundedTimeout } from '@/lib/admin/schedule-bridge-write';
import { vercelWaitUntil } from '@/lib/observability/vercel-wait-until';

let processHandlersRegistered = false;

// Shared 20-writes/minute ceiling across both handlers so a rejection storm
// cannot flood admin_events.
const BRIDGE_PROCESS_WRITE_LIMIT = 20;
let bridgeProcessWindowStart = Date.now();
let bridgeProcessWriteCount = 0;

/**
 * Ceiling on how long a handler waits for its Bridge write. A process-level
 * failure is already a bad moment; a hung write must not make it worse.
 */
export const BRIDGE_PROCESS_WRITE_TIMEOUT_MS = 3_000;

export type ProcessBridgeWriteOutcome = 'written' | 'timed_out' | 'rate_limited';

function allowBridgeProcessWrite(): boolean {
  const now = Date.now();
  if (now - bridgeProcessWindowStart > 60_000) {
    bridgeProcessWindowStart = now;
    bridgeProcessWriteCount = 0;
  }
  bridgeProcessWriteCount += 1;
  return bridgeProcessWriteCount <= BRIDGE_PROCESS_WRITE_LIMIT;
}

/**
 * Write a process-level error to the Bridge and WAIT for it, bounded.
 *
 * It used to be `void import('@/lib/server-error-logger').then(…)`: a lazy
 * chunk load followed by a write nobody awaited and nobody registered with the
 * platform. Sentry's capture in the same handler reached production (its SDK
 * flushes through the platform's request context); the Bridge row did not —
 * 6 `process.*` events in Sentry on 2026-09-01, 0 `admin_events` rows for
 * `process.*` in 60 days.
 *
 * There is no request scope in a `process.on` handler, so `next/server`'s
 * `after()` is unavailable here. Instead: the logger is imported statically
 * (this module only ever loads on the Node runtime), the write is handed to
 * the Vercel request context's `waitUntil` when one exists so the function is
 * not frozen underneath it, AND it is awaited under a timeout so the handler
 * itself holds the door as long as it safely can.
 */
export async function logProcessErrorToBridge(
  action: string,
  error: Error,
  metadata?: Record<string, unknown>,
): Promise<ProcessBridgeWriteOutcome> {
  if (!allowBridgeProcessWrite()) return 'rate_limited';
  const write = logServerException(
    error,
    { action, source: 'background_job', handled: false, ...(metadata ? { metadata } : {}) },
    'error',
  ).then(
    () => 'written' as const,
    () => 'written' as const,
  );
  vercelWaitUntil(write);
  return (await withBoundedTimeout(write, BRIDGE_PROCESS_WRITE_TIMEOUT_MS)) ?? 'timed_out';
}

/** Exported so the handler can be exercised without emitting a real process event. */
export async function handleUnhandledRejection(reason: unknown): Promise<ProcessBridgeWriteOutcome> {
  let error: Error;
  if (reason instanceof Error) {
    error = reason;
  } else {
    console.error('[instrumentation] unhandledRejection: non-Error reason', reason);
    error = new Error(`${String(reason)} (unhandled promise rejection with a non-Error reason)`);
    error.name = 'UnhandledRejection';
  }
  Sentry.captureException(error);
  return logProcessErrorToBridge(
    'process.unhandledRejection',
    error,
    reason instanceof Error ? undefined : { reason },
  );
}

/** Exported so the handler can be exercised without emitting a real process event. */
export async function handleUncaughtException(error: Error): Promise<ProcessBridgeWriteOutcome> {
  Sentry.captureException(error);
  return logProcessErrorToBridge('process.uncaughtException', error);
}

/**
 * Node-runtime only. Keeping these `process.on` calls outside
 * `src/instrumentation.ts` prevents Next from statically evaluating them while
 * it builds the Edge bundle.
 */
export function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {
    void handleUnhandledRejection(reason);
  });

  process.on('uncaughtException', (error) => {
    void handleUncaughtException(error);
  });
}

/** Test-only: reset the rate-limit window and the registration latch. */
export function __resetProcessErrorHandlersForTests(): void {
  processHandlersRegistered = false;
  bridgeProcessWindowStart = Date.now();
  bridgeProcessWriteCount = 0;
}
