// supabase/functions/_shared/observability.ts
//
// Fail-open Sentry Deno wrapper for Edge Functions — brief §13.
//
// IMPORT FORM AND INIT SHAPE, VERIFIED 2026-09-03 against the OFFICIAL
// Supabase guide (https://supabase.com/docs/guides/functions/examples/sentry-monitoring),
// not recalled: `import * as Sentry from 'npm:@sentry/deno@^8'`, and
// `Sentry.init({ dsn, defaultIntegrations: false, tracesSampleRate,
// profilesSampleRate })`. `defaultIntegrations: false` is REQUIRED, not
// optional — that same page, quoted verbatim: "Sentry Deno SDK currently do
// not support Deno.serve instrumentation, which means that there is no scope
// separation between requests" — with default integrations on, breadcrumbs
// and context from one invocation leak into the next because the Edge
// Functions runtime reuses the isolate across requests. `withScope` (used
// below) is the documented workaround: it "encapsulates Sentry SDK API
// calls" per-request instead of relying on automatic scope separation that
// does not exist here.
//
// FAIL-OPEN, ALWAYS. No `SENTRY_DSN` -> `init()` is skipped entirely and
// every exported function becomes a no-op passthrough. A Sentry SDK failure
// (bad DSN, network unreachable, `Sentry.init` throwing) must never break
// the actual function response a caller (push.ts, the personalize-email
// caller) is waiting on.
//
// NEVER A RAW BODY OR SECRET. Nothing in this file reads `req.json()`/`req.text()`
// — the wrapped handler owns the request body entirely, and this file never
// touches it. The three trace headers it DOES read
// (`traceparent`/`sentry-trace`/`baggage`) are propagation metadata, not
// payload; captured as tags for correlation. Full distributed trace
// CONTINUATION via `Sentry.continueTrace` is NOT VERIFIED against the
// pinned `@sentry/deno@^8` release in this pass — see
// `docs/observability/SUPABASE_SERVICE_OBSERVABILITY.md` — so this file only
// tags the incoming headers rather than asserting a trace-linking behavior
// nobody has confirmed against the live SDK.
//
// DEPLOYMENT IS AN OWNER ACTION. This file, and the three functions wrapped
// with it, are NOT deployed by this change. `supabase functions deploy`
// requires the owner's Supabase CLI session; see the B7 doc.
import * as Sentry from 'npm:@sentry/deno@^8';

let sentryInitialized = false;
let sentryConfigured = false;

function resolveRelease(): string | undefined {
  return (
    Deno.env.get('SUPABASE_FUNCTION_VERSION') ??
    Deno.env.get('GIT_SHA') ??
    Deno.env.get('VERCEL_GIT_COMMIT_SHA') ??
    undefined
  );
}

function ensureSentryInit(): void {
  if (sentryInitialized) return;
  sentryInitialized = true;
  try {
    const dsn = Deno.env.get('SENTRY_DSN');
    if (!dsn) return; // No-op: fail-open when Sentry isn't configured for this function.
    Sentry.init({
      dsn,
      // REQUIRED — see file header. Do not remove.
      defaultIntegrations: false,
      tracesSampleRate: Number(Deno.env.get('SENTRY_TRACES_SAMPLE_RATE') ?? '0.1') || 0,
      environment: Deno.env.get('SUPABASE_ENV') ?? 'production',
      release: resolveRelease(),
    });
    sentryConfigured = true;
  } catch {
    sentryConfigured = false;
  }
}

interface TraceHeaders {
  traceparent: string | null;
  sentryTrace: string | null;
  baggage: string | null;
}

function readTraceHeaders(req: Request): TraceHeaders {
  try {
    return {
      traceparent: req.headers.get('traceparent'),
      sentryTrace: req.headers.get('sentry-trace'),
      baggage: req.headers.get('baggage'),
    };
  } catch {
    return { traceparent: null, sentryTrace: null, baggage: null };
  }
}

/** Strips anything that isn't a short, safe primitive — defense in depth
 *  even though the caller is only ever expected to pass an `Error`. Never
 *  throws. */
function sanitizeExceptionForCapture(error: unknown): unknown {
  try {
    if (error instanceof Error) {
      // A fresh Error carrying only name/message/stack — never the original
      // object's own enumerable properties, which could carry a caller's
      // request-shaped data if the handler attached any.
      const safe = new Error(error.message);
      safe.name = error.name;
      safe.stack = error.stack;
      return safe;
    }
    return new Error('non_error_thrown');
  } catch {
    return new Error('exception_sanitization_failed');
  }
}

function logOutcome(fields: {
  functionName: string;
  outcome: 'ok' | 'error';
  status: number;
  durationMs: number;
  release: string | undefined;
}): void {
  try {
    // No structured-log.ts here — this is a separate Deno runtime that
    // cannot import Next.js server modules. A single JSON line is this
    // runtime's own low-cost equivalent; Supabase's function logs capture
    // stdout per-invocation already.
    console.log(
      JSON.stringify({
        event: 'edge_function.invocation',
        function_name: fields.functionName,
        outcome: fields.outcome,
        status: fields.status,
        duration_ms: fields.durationMs,
        release: fields.release ?? null,
      }),
    );
  } catch {
    // Never let logging break the response.
  }
}

/**
 * Wraps a Deno.serve handler: initializes Sentry (once, fail-open), captures
 * function name / release / outcome / status / latency / incoming trace
 * headers, and reports any thrown exception through `Sentry.withScope` +
 * `Sentry.captureException` (sanitized — see file header) before re-throwing
 * nothing: the wrapper itself returns a safe 500 Response rather than
 * letting an uncaught exception surface as a raw Deno runtime error to the
 * caller. `Sentry.flush` is awaited (bounded 2s, matching the official
 * guide's own example) so the Edge Function isolate does not get torn down
 * before the event actually sends.
 */
export function withObservedRequest(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    ensureSentryInit();
    const startedAt = Date.now();
    const trace = readTraceHeaders(req);
    const release = resolveRelease();

    try {
      const response = await handler(req);
      logOutcome({ functionName, outcome: 'ok', status: response.status, durationMs: Date.now() - startedAt, release });
      return response;
    } catch (error) {
      try {
        if (sentryConfigured) {
          Sentry.withScope((scope) => {
            scope.setTag('edge_function.name', functionName);
            if (release) scope.setTag('release', release);
            if (trace.traceparent) scope.setTag('trace.traceparent', trace.traceparent);
            if (trace.sentryTrace) scope.setTag('trace.sentry_trace', trace.sentryTrace);
            // `baggage` is a caller-controlled request header. It is
            // propagation metadata by contract, but nothing enforces that,
            // so record only that it was present rather than its content —
            // the one unsanitized free-text path into telemetry otherwise.
            if (trace.baggage) scope.setTag('trace.baggage_present', 'true');
            Sentry.captureException(sanitizeExceptionForCapture(error));
          });
          await Sentry.flush(2000);
        }
      } catch {
        // Sentry reporting must never prevent a response from being returned.
      }

      logOutcome({ functionName, outcome: 'error', status: 500, durationMs: Date.now() - startedAt, release });

      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
