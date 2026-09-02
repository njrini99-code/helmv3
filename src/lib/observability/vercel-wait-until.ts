/**
 * Register a promise with the Vercel function runtime so the function is kept
 * alive until it settles — the same `@vercel/request-context` global that
 * `@vercel/functions`' `waitUntil` and Sentry's own flush use.
 *
 * Why not `next/server`'s `after()`: it needs a request scope, and the
 * process-level handlers (`unhandledRejection`, `uncaughtException`) have none.
 * Why not `@sentry/core`'s `vercelWaitUntil`: it returns early unless
 * `EdgeRuntime` is defined, so it is a no-op on the Node runtime this app's
 * handlers run in.
 *
 * Returns whether a `waitUntil` was actually found. `false` outside Vercel (a
 * plain Node server, a test) — callers await the promise themselves either
 * way; this only decides whether the platform will ALSO hold the door.
 * Never throws.
 */
const REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');

interface VercelRequestContext {
  waitUntil?: (task: Promise<unknown>) => void;
}

interface VercelRequestContextGlobal {
  get?: () => VercelRequestContext | undefined;
}

export function vercelWaitUntil(task: Promise<unknown>): boolean {
  try {
    const holder = (globalThis as unknown as Record<symbol, VercelRequestContextGlobal | undefined>)[
      REQUEST_CONTEXT_SYMBOL
    ];
    const waitUntil = holder?.get?.()?.waitUntil;
    if (typeof waitUntil !== 'function') return false;
    waitUntil(task);
    return true;
  } catch {
    return false;
  }
}

/** Test-only: install or remove a fake request context. */
export function __setVercelRequestContextForTests(ctx: VercelRequestContext | null): void {
  const g = globalThis as unknown as Record<symbol, VercelRequestContextGlobal | undefined>;
  if (ctx === null) {
    delete g[REQUEST_CONTEXT_SYMBOL];
    return;
  }
  g[REQUEST_CONTEXT_SYMBOL] = { get: () => ctx };
}
