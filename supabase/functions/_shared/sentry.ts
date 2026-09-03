// Shared Sentry Deno wiring for Helm's edge functions — brief §13.
//
// `_shared/` is excluded from Supabase's function bundler by its leading
// underscore (the documented convention every current Supabase Edge
// Function example uses for cross-function code) — this file is never
// itself deployed as a function, only imported by ones that are.
//
// GATED BY ENV PRESENCE, FAIL-SOFT: no `SENTRY_DSN` secret means `initEdgeSentry`
// is a no-op and `captureEdgeException` swallows silently — an edge function
// must never fail a real request because observability could not initialize.
// Setting `SENTRY_DSN` via `supabase secrets set` is OWNER ACTION (see
// supabase/functions/README.md — edge functions are not part of any deploy
// this repo performs, and neither is a secret).
//
// `defaultIntegrations: false` per Sentry's own Supabase Edge Function guide
// (docs.sentry.io / supabase.com/docs/guides/functions/examples/sentry-monitoring,
// verified 2026-09-03): the Deno SDK's default integrations assume request-scope
// isolation Deno edge functions don't provide. Capture stays explicit —
// `captureEdgeException` at each function's own catch block — rather than
// relying on any automatic instrumentation.
import * as Sentry from "npm:@sentry/deno@^8";

let initialized = false;

export function initEdgeSentry(functionName: string): void {
  try {
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn) return; // NOT_CONFIGURED — never a throw, never a fake DSN.
    if (initialized) return; // idempotent — Deno.serve may re-enter the module scope across warm invocations.

    Sentry.init({
      dsn,
      defaultIntegrations: false,
      // Edge functions are low-volume, latency-sensitive, and this repo has
      // no paid Sentry quota concern documented for them (brief's $0
      // constraint is about NEW vendors/log drains, not about sampling
      // existing Sentry usage down) — full capture, no profiling (profiling
      // needs a native runtime Deno's edge sandbox does not offer).
      tracesSampleRate: 1.0,
      environment: Deno.env.get("SB_REGION") ? "production" : "unknown",
    });
    Sentry.setTag("helm.edge_function", functionName);
    const region = Deno.env.get("SB_REGION");
    const executionId = Deno.env.get("SB_EXECUTION_ID");
    if (region) Sentry.setTag("region", region);
    if (executionId) Sentry.setTag("execution_id", executionId);

    initialized = true;
  } catch {
    // Never let observability initialization break the function it is
    // meant to observe.
  }
}

/** Call from a function's own catch block, THEN return its normal error
 *  response — never let this delay or replace that response beyond the
 *  bounded flush below. */
export async function captureEdgeException(error: unknown): Promise<void> {
  try {
    if (!initialized) return;
    Sentry.captureException(error);
    // Edge function invocations can end (and their process suspend) the
    // instant the handler returns — flush with a short bound so a pending
    // Sentry HTTP call has a chance to leave before that happens, without
    // holding up the response indefinitely.
    await Sentry.flush(2000);
  } catch {
    // Fail-open, unconditionally.
  }
}
