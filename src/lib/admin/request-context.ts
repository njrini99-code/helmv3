/**
 * Helm Bridge — request-scoped correlation context.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * `RoundErrorContext.requestId` has existed for a long time and is wired all
 * the way through: `normalizeContext` writes it into `admin_events.metadata`
 * and `captureSentryTrace` tags it onto the Sentry scope
 * (`scope.setTag('request_id', …)`). Two admin surfaces even read it back OUT
 * of persisted metadata. But a repo-wide grep for a `requestId:` argument at
 * any `logServerError` / `logServerException` / `logServerEvent` CALL SITE
 * returned zero hits — nothing ever put a value in. The plumbing was
 * complete and the tap was never opened.
 *
 * The consequence: when one server action logs several times (a soft failure,
 * then a thrown exception, then an RLS denial), those rows land in
 * admin_events with NO shared key. An operator cannot ask "what else happened
 * on this same request", which is the first question worth asking about any
 * non-trivial failure.
 *
 * WHY ASYNCLOCALSTORAGE, AND WHY HERE
 * -----------------------------------
 * The alternative — passing a requestId through every call site — is the
 * design that already failed: ~60 call sites each had to remember, and none
 * did. ALS makes it structural instead of optional. `withAdminObserved`
 * (~129 wrapped server actions) opens exactly one scope per invocation, and
 * every logger call anywhere beneath it inherits the id for free, including
 * from helpers many frames deep that know nothing about this module.
 *
 * ALS is supported on Vercel Functions (Node runtime) and is already used in
 * this codebase for the same "ambient per-run value" job — see
 * `src/lib/coachhelm/v2/insights/gate-context.ts` and
 * `src/lib/golf/stats-action-context.ts`. This is an extension of an
 * established idiom, not a new pattern.
 *
 * SAFETY
 * ------
 * Everything here is best-effort and non-throwing. When no scope is active
 * (an unwrapped route handler, a cron, a test) `getRequestId()` returns
 * `null` and behaviour is byte-for-byte what it was before this file
 * existed. Correlation is an enrichment; it must never be able to break a
 * request.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  /** Correlation id shared by every log line emitted during one invocation. */
  requestId: string;
  /** The wrapped action's name, so nested logs can attribute themselves. */
  action?: string | null;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a correlation id. Prefers `crypto.randomUUID` and degrades to a
 * timestamp+random composite rather than throwing on an exotic runtime —
 * a missing id must never break the action being instrumented.
 */
export function newRequestId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now().toString(36)}`;
  } catch {
    return `req_${Date.now().toString(36)}`;
  }
}

/**
 * Run `fn` inside a fresh correlation scope.
 *
 * NESTING: if a scope is already active this REUSES it rather than opening a
 * new one. That matters because wrapped actions call other wrapped actions —
 * minting a fresh id per nested frame would fragment exactly the correlation
 * this module exists to provide, turning one logical request into several
 * unrelated ids.
 */
export function runWithRequestContext<T>(
  seed: { action?: string | null },
  fn: () => T,
): T {
  try {
    const existing = requestContext.getStore();
    if (existing) return fn();
    return requestContext.run({ requestId: newRequestId(), action: seed.action ?? null }, fn);
  } catch {
    // A failure to establish context must never prevent the work itself.
    return fn();
  }
}

/** Active correlation id, or null when no scope is open. Never throws. */
export function getRequestId(): string | null {
  try {
    return requestContext.getStore()?.requestId ?? null;
  } catch {
    return null;
  }
}

/** Active action name, or null. Never throws. */
export function getRequestAction(): string | null {
  try {
    return requestContext.getStore()?.action ?? null;
  } catch {
    return null;
  }
}

/** Test-only: run a body with an explicit, deterministic context. */
export function __runWithRequestContextForTests<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}
