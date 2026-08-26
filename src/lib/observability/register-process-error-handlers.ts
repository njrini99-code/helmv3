import * as Sentry from '@sentry/nextjs';

let processHandlersRegistered = false;

// Shared 20-writes/minute ceiling across both handlers so a rejection storm
// cannot flood admin_events.
const BRIDGE_PROCESS_WRITE_LIMIT = 20;
let bridgeProcessWindowStart = Date.now();
let bridgeProcessWriteCount = 0;

function allowBridgeProcessWrite(): boolean {
  const now = Date.now();
  if (now - bridgeProcessWindowStart > 60_000) {
    bridgeProcessWindowStart = now;
    bridgeProcessWriteCount = 0;
  }
  bridgeProcessWriteCount += 1;
  return bridgeProcessWriteCount <= BRIDGE_PROCESS_WRITE_LIMIT;
}

function logProcessErrorToBridge(action: string, error: Error, metadata?: Record<string, unknown>): void {
  if (!allowBridgeProcessWrite()) return;
  void import('@/lib/server-error-logger')
    .then((m) =>
      m.logServerException(
        error,
        { action, source: 'background_job', handled: false, ...(metadata ? { metadata } : {}) },
        'error',
      ),
    )
    .catch(() => {});
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
    let error: Error;
    if (reason instanceof Error) {
      error = reason;
    } else {
      console.error('[instrumentation] unhandledRejection: non-Error reason', reason);
      error = new Error(`${String(reason)} (unhandled promise rejection with a non-Error reason)`);
      error.name = 'UnhandledRejection';
    }
    Sentry.captureException(error);
    logProcessErrorToBridge(
      'process.unhandledRejection',
      error,
      reason instanceof Error ? undefined : { reason },
    );
  });

  process.on('uncaughtException', (error) => {
    Sentry.captureException(error);
    logProcessErrorToBridge('process.uncaughtException', error);
  });
}
