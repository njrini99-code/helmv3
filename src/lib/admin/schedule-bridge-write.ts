import { after } from 'next/server';
import { bindRequestContext } from '@/lib/admin/request-context';

/**
 * Helm Bridge — schedule an error-path write so it is neither dropped nor paid
 * for by the response.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * Every capture class on the thrown-error path detached its Bridge write:
 *
 *     void logServerException(err, …).catch(() => {});
 *     throw err;
 *
 * On a plain Node server that is merely untidy. On Vercel it is a coin flip:
 * once the response is sent the function freezes, and a promise nobody awaited
 * and nobody registered with the platform simply stops. Sentry's own capture
 * reached production (its SDK registers its flush with the platform); the row
 * that feeds the incident queue did not. Measured 2026-09-01: 6 process-level
 * rejections in Sentry that day, 0 `admin_events` rows for `process.*` in 60
 * days.
 *
 * WHAT THIS DOES
 * --------------
 * Inside a request scope (server action, route handler, server component,
 * proxy) it hands the write to Next 16's `after()`, which runs it once the
 * response has finished and — on Vercel — keeps the function alive until it
 * completes. That is zero added latency on the error path and a write that
 * actually lands.
 *
 * Outside a request scope (`after()` throws: unit tests, module init, a cron
 * body inside `unstable_cache`, a static prerender) it falls back to AWAITING
 * the write under a bounded timeout, so a hung Bridge write can never wedge the
 * caller either. Fallback, not silence: a dropped write is the failure mode
 * being removed here, so the fallback has to be the awaited one.
 *
 * The active correlation scope is captured at call time and re-entered inside
 * the deferred task, because `after()` callbacks run outside the request's
 * AsyncLocalStorage continuation and would otherwise lose `requestId`.
 *
 * NEVER rejects. NEVER throws. The write's own failure is swallowed here by
 * contract — observability must not change the result of the thing observed.
 */

export const DEFAULT_BRIDGE_WRITE_TIMEOUT_MS = 2_500;

/** How the write ended up being run. Exposed for tests and diagnostics. */
export type BridgeWriteScheduling = 'after' | 'awaited';

export interface ScheduleBridgeWriteOptions {
  /** Ceiling on the AWAITED fallback path. Irrelevant on the `after()` path. */
  timeoutMs?: number;
}

/**
 * Race `promise` against a timer. Resolves `undefined` when the timer wins.
 * The timer is cleared (and unref'd where supported) so an awaited write can
 * never hold a Node process open on its own.
 */
export function withBoundedTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function scheduleBridgeWrite(
  write: () => Promise<unknown>,
  opts: ScheduleBridgeWriteOptions = {},
): Promise<BridgeWriteScheduling> {
  const bound = bindRequestContext();
  const task = (): Promise<void> => {
    try {
      return Promise.resolve(bound(write)).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      // A write that throws synchronously is a write that failed; same verdict
      // as one that rejected. Nothing propagates.
      return Promise.resolve();
    }
  };

  try {
    after(task);
    return Promise.resolve('after');
  } catch {
    // Not in a request scope (or in a context where after() cannot run):
    // fall through to the awaited path.
  }

  return withBoundedTimeout(task(), opts.timeoutMs ?? DEFAULT_BRIDGE_WRITE_TIMEOUT_MS).then(
    () => 'awaited' as const,
  );
}
