/**
 * The bridge between Sentry's own trace id and Helm's independent trace id
 * (the flight recorder / `helm_debug` schema, and the `traceId` field
 * `server-error-logger.ts` writes onto every `error_logs`/`admin_events` row).
 *
 * TWO DIRECTIONS, BOTH NEEDED
 * ----------------------------
 *   getSentryCorrelation()   READ the active Sentry span's own ids, so a
 *                            Helm-side record (an `error_logs` row, a
 *                            `trace_runs` row) can be joined back to the
 *                            Sentry trace that produced it.
 *   attachHelmTrace(id)      WRITE Helm's trace id onto the active Sentry
 *                            span AND the current scope, so a Sentry issue
 *                            can be filtered/searched by Helm's own id.
 *
 * `server-error-logger.ts`'s `enrichTraceContext` already reads
 * `Sentry.getActiveSpan()?.spanContext().traceId` inline (it predates this
 * module and is left as-is — not a caller of this file). `getSentryCorrelation`
 * here exists for every NEW caller so that pattern is written once, not
 * re-derived at each new call site.
 *
 * `helm-flight-recorder.ts` already carries the OTHER inverse — its
 * `baseMetadata` puts `sentry_trace_id`/`root_span_id` from the span it
 * constructs into every `trace_runs` row (helm-flight-recorder.ts:247-248).
 * That is additive-only and NOT routed through this module: `startInactiveSpan`
 * already inherits the ambient trace when one is active, so the flight
 * recorder's own span id already IS the correlated id, and rewiring a
 * hot round-save path "for consistency" is a behavior-risk this phase does
 * not need to take. See helm-flight-recorder.test.ts for its own coverage.
 *
 * FAIL-OPEN, EVERYWHERE
 * ----------------------
 * A correlation id is enrichment, never a requirement. Every function here
 * is wrapped in try/catch and degrades to `null` / a no-op rather than ever
 * throwing into a caller's request path.
 */
import * as Sentry from '@sentry/nextjs';

export interface SentryCorrelation {
  traceId: string;
  spanId: string;
}

/**
 * Reads the active Sentry span's trace + span id, if one is active.
 * Returns `null` when there is no active span, when the span carries no
 * usable ids (should not happen in practice — defensive only), or when
 * reading the SDK surface itself throws (e.g. a test double, or an SDK
 * internal error).
 */
export function getSentryCorrelation(): SentryCorrelation | null {
  try {
    const span = Sentry.getActiveSpan();
    if (!span) return null;
    const { traceId, spanId } = span.spanContext();
    if (!traceId || !spanId) return null;
    return { traceId, spanId };
  } catch {
    return null;
  }
}

/**
 * Attaches Helm's own trace id (the flight recorder's UUID, or any other
 * Helm-side correlation id) to the CURRENT Sentry context two ways:
 *
 *   1. As a `helm.trace_id` attribute on the active span, if one exists —
 *      visible on that one trace in Sentry's trace view.
 *   2. As a `helm.trace_id` tag on the current scope — visible on every
 *      event (span, error, log) the scope produces afterward, and
 *      searchable in Sentry's issue/event search regardless of whether a
 *      span happens to be active.
 *
 * Both writes are independent and each is individually fail-open: a thrown
 * span-attribute write does not prevent the scope tag from being set, and
 * vice versa.
 */
export function attachHelmTrace(traceId: string): void {
  try {
    Sentry.getActiveSpan()?.setAttribute('helm.trace_id', traceId);
  } catch {
    // Never let a telemetry write break the caller.
  }
  try {
    Sentry.setTag('helm.trace_id', traceId);
  } catch {
    // Never let a telemetry write break the caller.
  }
}
