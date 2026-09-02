import { logServerEvent } from '@/lib/server-error-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import { scheduleBridgeWrite } from '@/lib/admin/schedule-bridge-write';

/**
 * Helm Bridge capture class — DEAD INTEGRATIONS.
 *
 * THE GAP
 * -------
 * The Bridge's own upstream readers (`sentry-api.ts`, `vercel-api.ts`, the
 * GitHub helpers) are deliberately fail-soft: every error branch returns a
 * `failed()` envelope and `sentry-api.ts`'s own doc comment states the module
 * "NEVER throws". That is the right call for rendering — one dead provider
 * must not take down the console.
 *
 * But nothing was ever WRITTEN DOWN. A Sentry 429, an expired
 * `VERCEL_API_TOKEN`, or a GitHub rate-limit produced exactly zero durable
 * signal: the only person who ever learned about it was whoever happened to
 * be looking at that one Surface card during that one render, and the state
 * vanished on the next successful poll. There was no row to alert on, no
 * history to ask "how long has this been broken", and no way to discover it
 * had been broken at all after the fact.
 *
 * This module is the missing half: the same fail-soft envelope, plus a
 * throttled, durable `admin_events` row.
 *
 * DESIGN NOTES
 * ------------
 * - Emits `error_code: provider_<id>_<kind>`, which is already the stable
 *   contract `incident-grouping.ts` short-circuits on (one upstream outage
 *   collapses to ONE operator incident across call sites, routes and
 *   wording) and which `incident-classification.ts` maps to the
 *   `integration` kind. No new vocabulary is introduced.
 * - `skipSentry: true`, matching `providerFaultSeverity`'s reasoning: Sentry
 *   exists to surface defects to engineers, and no code change fixes an
 *   expired token or an exhausted quota. The Bridge is the right destination.
 * - Throttled per (provider, kind) via the existing flood-collapse primitive.
 *   These readers run on EVERY render of the Errors/Overview tabs, so an
 *   unthrottled report would write a row per page view for as long as the
 *   integration stayed down — turning a signal into the noise this session
 *   just finished removing.
 * - That throttle is PER PROCESS, and on serverless a 60s auto-refresh lands
 *   on a fresh lambda most of the time — measured 2026-09-01, 99 identical
 *   `provider_vercel_unavailable` rows in 2h05m from `/admin/deploys` alone.
 *   The durable half is `durable-collapse.ts`, applied inside the logger for
 *   every `provider_*` code: an occurrence inside 15 minutes of an open row
 *   with the same fingerprint bumps that row's `collapsed_count` instead of
 *   inserting. The readers ALSO negative-cache their own failure
 *   (vercel-api.ts) so a dead endpoint is probed at most every few minutes.
 * - NEVER fails, slows, or changes the render that noticed it — exactly like
 *   `rls-denial.ts`. The write is scheduled past the response with
 *   `scheduleBridgeWrite` (Next `after()` in a request scope, an awaited
 *   bounded write otherwise) rather than detached with `void`, because a
 *   detached promise on a serverless function is dropped once the response is
 *   sent. Same signal, no latency, actually persisted.
 * - Only genuine FAILURES are reported, never `unconfigured`. A missing env
 *   var is a config state, not an incident — it is already surfaced by the
 *   status banner (which now treats any non-`ok` feed as stale) and by the
 *   "needs env" chip. Writing a row every minute forever for a deliberately
 *   unset optional integration would be pure noise.
 */

export type IntegrationId = 'sentry' | 'vercel' | 'github';

/** Coarse fault kind, mirroring provider-fault.ts's vocabulary. */
export type IntegrationFaultKind = 'rate_limited' | 'invalid_credential' | 'unavailable';

const KIND_COPY: Record<IntegrationFaultKind, string> = {
  rate_limited: 'is rate-limiting the Bridge. This usually clears on its own.',
  invalid_credential: 'rejected the configured credential — it is set but no longer valid.',
  unavailable: 'could not be reached. The Bridge is rendering without its data.',
};

/**
 * Infer the fault kind from a provider's error text. Deliberately coarse:
 * the operator action differs between "wait" and "replace the token", and
 * finer detail than that belongs in the message, not the grouping key.
 */
export function inferIntegrationFaultKind(detail: string): IntegrationFaultKind {
  const text = detail.toLowerCase();
  if (/\b429\b|rate.?limit|too many requests/.test(text)) return 'rate_limited';
  if (/\b40[13]\b|unauthor|forbidden|invalid.*(token|key)|authentication/.test(text)) {
    return 'invalid_credential';
  }
  return 'unavailable';
}

/**
 * Record that a Bridge integration failed. Safe to call on every failed
 * fetch — throttling and error-swallowing are handled here. Never rejects.
 *
 * Resolves the envelope-ready error string unchanged so a call site can stay
 * a one-liner: `return failed(await reportIntegrationFault('sentry', '…', msg))`.
 */
export async function reportIntegrationFault(
  integration: IntegrationId,
  what: string,
  detail: string,
): Promise<string> {
  try {
    const kind = inferIntegrationFaultKind(detail);
    const throttleKey = `integration:${integration}:${kind}`;
    if (shouldEmit(throttleKey)) {
      const collapsed = drainCollapsedCount(throttleKey);
      // Awaited, not `void`ed — the same reason as observed-action.ts and
      // job-log.ts. Inside a request scope this resolves at once (after() has
      // the write, the render pays nothing). Outside one — a cron body, a
      // prerender — the bounded await IS what keeps the function alive, and a
      // `void`ed bounded await is a promise nobody holds.
      await scheduleBridgeWrite(() => logServerEvent(
        `${integration} ${KIND_COPY[kind]} (${what})`,
        {
          action: `integration.${integration}`,
          source: 'integrity',
          feature: 'admin_dashboard',
          sport: 'shared',
          // Stable across call sites/wording so one outage is one incident.
          errorCode: `provider_${integration}_${kind}`,
          errorDetails: detail.slice(0, 500),
          skipSentry: true,
          handled: true,
          ...(collapsed > 0 ? { metadata: { collapsed_count: collapsed } } : {}),
        },
        // An unreachable or unauthenticated integration means the console is
        // showing an incomplete picture, which an operator must know about.
        // Rate limiting is self-healing, so it stays a warning.
        kind === 'rate_limited' ? 'warning' : 'error',
      ));
    }
  } catch {
    // Reporting a dead integration must never break the caller that noticed.
  }
  return detail;
}
