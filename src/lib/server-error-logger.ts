'use server';

import * as Sentry from '@sentry/nextjs';
import { shouldPersistAdminTables, getRuntimeEnv } from '@/lib/telemetry-gate';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';
import { buildIncidentSignature, type IncidentSeverity } from '@/lib/admin/incident-grouping';
import { classifyTraceSurface } from '@/lib/error-trace-classification';
import { markBridgeLogged } from '@/lib/bridge-logged-marker';
import { getRequestId } from '@/lib/admin/request-context';
import { collapseEmbeddedHtml } from '@/lib/utils/describe-error';

export type ServerTraceSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ServerTraceSource =
  | 'server_action'
  | 'route_handler'
  | 'server_component'
  | 'background_job'
  | 'request_hook'
  | 'rls_denial'
  | 'auth'
  | 'cron'
  | 'integrity';

interface RoundErrorContext {
  action: string;
  title?: string;
  route?: string | null;
  url?: string | null;
  featureArea?: string | null;
  /**
   * Helm Bridge: canonical feature key from
   * src/lib/admin/feature-registry.ts (FEATURE_COVERAGE.md §1). Written to
   * admin_events.feature (W15 Task 1 migration). Distinct from the older
   * free-text `featureArea` — both are kept for continuity of saved Sentry
   * searches tagged on `feature_area`.
   */
  feature?: string | null;
  source?: ServerTraceSource;
  statusCode?: number | null;
  requestId?: string | null;
  runtime?: 'nodejs' | 'edge' | 'unknown';
  handled?: boolean;
  roundId?: string | null;
  playerId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  holesCount?: number;
  shotsCount?: number;
  errorCode?: string;
  errorHint?: string;
  errorDetails?: string;
  fingerprint?: string[];
  tags?: Record<string, string | number | boolean | null | undefined>;
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  /**
   * When true, suppress the Sentry capture for this trace (the error_logs +
   * admin_events rows are still written). Use for ROUTINE operational telemetry
   * — threshold starvation, philosophy-gate filters, handled-degradation
   * fallbacks — that should stay discoverable in the admin feed + console
   * without creating Sentry issues that drown out real bugs.
   */
  skipSentry?: boolean;
  /** Helm Bridge wayfinding: which product surface emitted this. */
  sport?: 'golf' | 'baseball' | 'shared';
  /** Helm Bridge: owning team (golf_teams.id or baseball_teams.id). */
  teamId?: string | null;
  /**
   * Helm Bridge: single stable DB grouping key written to
   * admin_events.fingerprint. Distinct from the Sentry `fingerprint`
   * string[] above. Defaults to buildIncidentSignature(severity, errorCode,
   * route, message) so identical failures collapse in the triage queue.
   */
  dbFingerprint?: string;
}

const SENTRY_SEVERITY_MAP: Record<ServerTraceSeverity, Sentry.SeverityLevel> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'fatal',
};

function normalizeContext(context: RoundErrorContext, traceMessage?: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify({
    action: context.action,
    route: context.route ?? null,
    url: context.url ?? null,
    featureArea: context.featureArea ?? null,
    feature: context.feature ?? context.featureArea ?? null,
    source: context.source ?? 'server_action',
    statusCode: context.statusCode ?? null,
    requestId: context.requestId ?? null,
    runtime: context.runtime ?? process.env.NEXT_RUNTIME ?? 'nodejs',
    handled: context.handled ?? true,
    roundId: context.roundId ?? null,
    playerId: context.playerId ?? null,
    userId: context.userId ?? null,
    userEmail: context.userEmail ?? null,
    holesCount: context.holesCount ?? null,
    shotsCount: context.shotsCount ?? null,
    errorCode: context.errorCode ?? null,
    errorHint: context.errorHint ?? null,
    errorDetails: context.errorDetails ?? null,
    tags: context.tags ?? {},
    metadata: context.metadata ?? {},
    extra: context.extra ?? {},
    sport: context.sport ?? null,
    teamId: context.teamId ?? null,
    ...(traceMessage ? { trace_message: traceMessage.slice(0, 2000) } : {}),
    // Only reached when shouldPersistAdminTables() is true (writeAdminTables
    // is called after that gate), so this is always 'production' in practice
    // today — tagged explicitly so a future gate regression is visible in
    // the row itself, not just inferred from the gate having passed.
    runtimeEnv: getRuntimeEnv(),
  }));
}

function buildAdminTitle(message: string, context: RoundErrorContext, severity: ServerTraceSeverity): string {
  if (context.title?.trim()) {
    return context.title.trim().slice(0, 500);
  }

  const actionPrefix = context.action ? `[${context.action}] ` : '';
  const fallback = `${actionPrefix}${message}`;

  if (severity === 'critical') {
    return `Critical: ${fallback}`.slice(0, 500);
  }

  return fallback.slice(0, 500);
}

function buildUrl(context: RoundErrorContext): string | null {
  if (context.url) return context.url;
  if (context.route) return context.route;
  if (context.action) return `/server/${context.action}`;
  return null;
}

function buildFingerprint(context: RoundErrorContext, severity: ServerTraceSeverity): string[] {
  if (context.fingerprint?.length) {
    return context.fingerprint;
  }

  return [
    context.source ?? 'server_action',
    context.featureArea ?? 'unknown',
    context.action,
    context.errorCode ?? severity,
  ];
}

/** Infer sport when legacy emitters omit context.sport (most baseball actions pre-withBaseballAction). */
function inferSport(message: string, context: RoundErrorContext): NonNullable<RoundErrorContext['sport']> | null {
  if (context.sport) return context.sport;
  const probe = `${context.route ?? ''} ${context.url ?? ''} ${context.action ?? ''}`;
  const classified = classifyTraceSurface(probe, context.action ?? null);
  if (classified.sport) return classified.sport;
  if (/baseball/i.test(message)) return 'baseball';
  if (/\bgolf\b|coachhelm/i.test(message)) return 'golf';
  return null;
}

function enrichTraceContext(message: string, rawContext: RoundErrorContext): RoundErrorContext {
  // Default requestId from the ambient correlation scope opened by
  // withAdminObserved. Done HERE, centrally, because the per-call-site
  // approach is the one that demonstrably failed: the field existed for
  // months and not one of ~60 call sites ever passed it. An explicitly
  // supplied requestId always wins.
  const ambientRequestId = getRequestId();
  const context: RoundErrorContext =
    rawContext.requestId || !ambientRequestId
      ? rawContext
      : { ...rawContext, requestId: ambientRequestId };

  const sport = inferSport(message, context);
  if (!sport) return context;
  const probe = `${context.route ?? ''} ${context.url ?? ''} ${context.action ?? ''} ${message}`;
  const classified = classifyTraceSurface(probe, context.action ?? null);
  return {
    ...context,
    sport,
    feature: context.feature ?? classified.feature ?? context.featureArea ?? null,
  };
}

// Ceiling on 'bridge_write_failed' Sentry alerts (mirrors instrumentation.ts's
// BRIDGE_PROCESS_WRITE_LIMIT for the process-level fallback path). Without
// this, a Supabase outage — the exact scenario the Bridge exists to surface —
// turns every failed error_logs/admin_events insert across the whole app
// into its own unbounded Sentry issue.
const BRIDGE_WRITE_FAILURE_ALERT_LIMIT = 5;
let bridgeWriteFailureWindowStart = Date.now();
let bridgeWriteFailureCount = 0;

function allowBridgeWriteFailureAlert(): boolean {
  const now = Date.now();
  if (now - bridgeWriteFailureWindowStart > 60_000) {
    bridgeWriteFailureWindowStart = now;
    bridgeWriteFailureCount = 0;
  }
  bridgeWriteFailureCount += 1;
  return bridgeWriteFailureCount <= BRIDGE_WRITE_FAILURE_ALERT_LIMIT;
}

type BridgeWriteResult = {
  error?: { code?: string; message?: string } | null;
};

function isTransientBridgeWriteFailure(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : (error as { message?: string } | null)?.message ?? String(error);
  return /fetch failed|network|load failed|timed? ?out|econnreset|socket/i.test(message);
}

async function retryTransientBridgeWrite(
  write: () => PromiseLike<BridgeWriteResult>,
): Promise<BridgeWriteResult> {
  try {
    const first = await write();
    if (!first.error || !isTransientBridgeWriteFailure(first.error)) return first;
  } catch (error) {
    if (!isTransientBridgeWriteFailure(error)) throw error;
  }

  // Rows carry a caller-generated UUID and are upserted below, making this
  // one retry idempotent even if the first HTTP response was lost after the
  // database committed it.
  return await write();
}

/** Max `error.cause` levels walked. Bounded so a pathological (or cyclic)
 *  chain can never turn one log write into an unbounded string build. */
const MAX_CAUSE_DEPTH = 5;
const STACK_BUDGET = 8000;

/**
 * Serialises `error.stack` PLUS its `error.cause` chain into the single
 * `stack` string persisted to error_logs.stack / admin_events.stack_trace.
 *
 * Why: `new Error('save failed', { cause: pgError })` is the standard V8
 * wrapping idiom, but `Error.prototype.stack` does NOT include the cause —
 * so the Bridge's own tables (the ones /admin/errors actually reads) were
 * keeping only the wrapper's stack and silently dropping the root cause.
 * Sentry chains `.cause` natively, which is exactly why this was invisible:
 * Sentry had the real cause and the Bridge did not.
 *
 * Cycle-safe (a `cause` that points back at an ancestor stops the walk) and
 * budget-bounded — never returns more than STACK_BUDGET characters.
 */
function buildStackWithCauseChain(error: unknown): string | null {
  const root = error instanceof Error ? error : null;
  if (!root) return null;

  const parts: string[] = [root.stack ?? `${root.name}: ${root.message}`];
  const seen = new Set<unknown>([root]);

  let current: unknown = (root as { cause?: unknown }).cause;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth++) {
    if (seen.has(current)) {
      parts.push('Caused by: [circular cause reference]');
      break;
    }
    seen.add(current);

    if (current instanceof Error) {
      parts.push(`Caused by: ${current.stack ?? `${current.name}: ${current.message}`}`);
      current = (current as { cause?: unknown }).cause;
      continue;
    }

    // Supabase/Postgres reject with plain objects ({ code, message, details,
    // hint }), not Error instances — that shape is the single most valuable
    // cause in this codebase, so serialise it rather than skipping it.
    if (typeof current === 'object') {
      let rendered: string;
      try {
        rendered = JSON.stringify(current);
      } catch {
        rendered = '[unserialisable cause]';
      }
      parts.push(`Caused by: ${rendered}`);
    } else {
      parts.push(`Caused by: ${String(current)}`);
    }
    break;
  }

  return parts.join('\n').slice(0, STACK_BUDGET);
}

async function writeAdminTables(
  message: string,
  error: Error | null,
  context: RoundErrorContext,
  severity: ServerTraceSeverity
) {
  const enriched = enrichTraceContext(message, context);
  const admin = createAdminClient();
  const normalizedContext = normalizeContext(enriched);
  const url = buildUrl(enriched);
  const title = buildAdminTitle(message, enriched, severity);
  const stack = buildStackWithCauseChain(error);
  const timestamp = new Date().toISOString();
  const errorLogId = crypto.randomUUID();
  const adminEventId = crypto.randomUUID();

  const writeErrorLog = () => admin.from('error_logs').upsert({
    id: errorLogId,
    message: message.slice(0, 2000),
    severity,
    stack,
    context: normalizedContext as Json,
    user_id: context.userId ?? null,
    url,
    timestamp,
  }, { onConflict: 'id' });

  const dbFingerprint =
    context.dbFingerprint ??
    buildIncidentSignature({
      severity: severity as IncidentSeverity,
      errorCode: context.errorCode ?? null,
      route: context.route ?? context.url ?? null,
      message,
    });

  const writeAdminEvent = () => admin.from('admin_events').upsert({
    id: adminEventId,
    event_type: 'error',
    title,
    severity,
    message: message.slice(0, 10000),
    metadata: normalizedContext as Json,
    user_id: enriched.userId ?? null,
    user_email: enriched.userEmail ?? null,
    url,
    stack_trace: stack,
    browser_info: null,
    sport: enriched.sport ?? null,
    team_id: enriched.teamId ?? null,
    fingerprint: dbFingerprint,
    source: enriched.source ?? 'server_action',
    feature: enriched.feature ?? enriched.featureArea ?? null,
  }, { onConflict: 'id' });

  const [errorLogResult, adminEventResult] = await Promise.allSettled([
    retryTransientBridgeWrite(writeErrorLog),
    retryTransientBridgeWrite(writeAdminEvent),
  ]);

  // The Bridge's own persistence must never depend on itself to notice it's
  // failing — this only ever falls through to console + Sentry, never back
  // into logServerError/logServerException (that would recurse).
  for (const [table, result] of [
    ['error_logs', errorLogResult],
    ['admin_events', adminEventResult],
  ] as const) {
    const writeError =
      result.status === 'rejected'
        ? result.reason
        : (result.value as { error?: { code?: string; message?: string } } | undefined)?.error;
    if (!writeError) continue;

    const code = (writeError as { code?: string })?.code ?? null;
    const failureMessage = (writeError as { message?: string })?.message ?? String(writeError);
    // console.error is itself captured as a Sentry issue by the client/server
    // console integration. Use warn for the log stream and emit exactly one
    // explicit, stably-grouped issue below.
    console.warn('[ServerErrorLogger] Bridge write failed', { table, code, message: failureMessage });
    if (allowBridgeWriteFailureAlert()) {
      Sentry.captureMessage('bridge_write_failed', {
        level: 'error',
        tags: { table },
        // Stable fingerprint (not per-message) so repeated failures during
        // an outage collapse into one Sentry issue instead of fanning out.
        fingerprint: ['bridge_write_failed'],
      });
    }
  }
}

/** Static Sentry title — user/error copy lives in scope context, not the format string. */
function sentryCaptureTitle(context: RoundErrorContext): string {
  if (context.title?.trim()) {
    return context.title.trim().slice(0, 200);
  }
  return `[${context.action}] server trace`;
}

function syntheticTraceError(message: string): Error {
  const err = new Error('Server trace error');
  err.cause = message;
  return err;
}

function captureSentryTrace(
  message: string,
  error: Error | null,
  context: RoundErrorContext,
  severity: ServerTraceSeverity,
  forceException: boolean,
) {
  Sentry.withScope((scope) => {
    scope.setLevel(SENTRY_SEVERITY_MAP[severity] ?? 'error');
    scope.setTag('action', context.action);
    scope.setTag('error_source', context.source ?? 'server_action');
    scope.setTag('feature_area', context.featureArea ?? 'unknown');
    scope.setTag('feature', context.feature ?? context.featureArea ?? 'unknown');
    if (context.sport) scope.setTag('sport', context.sport);
    scope.setTag('handled', String(context.handled ?? true));
    if (context.errorCode) scope.setTag('pg_error_code', context.errorCode);
    if (context.statusCode) scope.setTag('http_status', String(context.statusCode));
    if (context.requestId) scope.setTag('request_id', context.requestId);

    if (context.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        if (value != null) {
          scope.setTag(key, String(value));
        }
      }
    }

    if (context.userId || context.userEmail) {
      scope.setUser({
        id: context.userId ?? undefined,
        email: context.userEmail ?? undefined,
      });
    }

    scope.setContext('server_trace', normalizeContext(context, message));
    scope.setFingerprint(buildFingerprint(context, severity));

    // Route by severity: info/warning are messages (control-flow signals,
    // skipped-record counters, threshold starvation), error/critical are
    // exceptions. Without this split every logServerEvent(..., 'warning')
    // surfaced in Sentry as an Error issue, drowning out real bugs.
    // forceException=true preserves the original exception path for
    // logServerException callers who explicitly handed us an Error.
    const isMessage =
      !forceException && (severity === 'info' || severity === 'warning');
    const sentryTitle = sentryCaptureTitle(context);
    if (isMessage) {
      Sentry.captureMessage(sentryTitle, SENTRY_SEVERITY_MAP[severity] ?? 'warning');
    } else {
      Sentry.captureException(error ?? syntheticTraceError(message));
    }
  });
}

/**
 * Next.js control-flow "errors" (redirect(), notFound(), cookies() during
 * static prerender) are framework signals, not incidents. Logging them
 * produced 130 phantom "Dynamic server usage" admin_events on 2026-07-02/03
 * — one burst per preview build. Match on digest when the original error is
 * intact, and on the message when a wrapper already stringified it.
 */
function isNextControlFlowError(message: string, error: Error | null): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))) {
    return true;
  }
  const controlFlowMarker = 'Dynamic server usage:';
  return message.indexOf(controlFlowMarker) !== -1;
}

async function captureServerTrace(
  rawMessage: string,
  context: RoundErrorContext,
  severity: ServerTraceSeverity,
  error?: Error | null,
  forceException = false,
): Promise<void> {
  // Collapse an embedded gateway HTML page HERE, at the single sink, rather
  // than at the 155 call sites that interpolate a raw `error.message` into a
  // template string. One of them (cron.refresh-engagement) put ~6KB of
  // Cloudflare markup into admin_events on 2026-07-29.
  //
  // The size is the lesser problem. That markup carries a unique Ray ID, client
  // IP and to-the-second timestamp, and admin_events fingerprints hash the
  // message — so every occurrence of one outage mints a NEW incident group.
  // collapseEmbeddedHtml keeps the caller's prefix (which says WHICH call
  // failed) and replaces only the HTML with a byte-stable summary, so an outage
  // collapses to one incident with a count instead of dozens of singletons.
  const message = collapseEmbeddedHtml(rawMessage) ?? rawMessage;
  const enriched = enrichTraceContext(message, context);
  const normalizedError = error ?? syntheticTraceError(message);

  // Skip, don't rethrow: callers already decide how the original error
  // propagates; our only job is to not record framework signals as incidents.
  if (isNextControlFlowError(message, error ?? null)) return;

  if (!enriched.skipSentry) {
    try {
      captureSentryTrace(message, normalizedError, enriched, severity, forceException);
    } catch {
      // Sentry should never block request handling.
    }
  }

  if (!shouldPersistAdminTables()) {
    console.error('[ServerErrorLogger] not persisted off-prod', {
      severity,
      traceMessage: message,
      action: enriched.action ?? '',
    });
    return;
  }

  try {
    await writeAdminTables(message, normalizedError, enriched, severity);
  } catch {
    console.error('[ServerErrorLogger] Failed to persist trace', {
      traceMessage: message,
      context: enriched,
    });
  }
}

/**
 * Log an error from a server action, route handler, or server component.
 * Writes to Sentry, error_logs, and admin_events so the admin dashboard gets
 * the same incident signal as Sentry.
 */
export async function logServerError(
  message: string,
  context: RoundErrorContext,
  severity: Exclude<ServerTraceSeverity, 'info'> = 'error'
): Promise<void> {
  await captureServerTrace(message, context, severity);
}

/**
 * Capture an exception object while preserving the original stack trace.
 */
export async function logServerException(
  error: Error | unknown,
  context: RoundErrorContext,
  severity: Exclude<ServerTraceSeverity, 'info'> = 'error'
): Promise<void> {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  // Caller explicitly handed us an Error — preserve the exception path so
  // the stack trace is captured even at warning severity.
  await captureServerTrace(normalizedError.message, context, severity, normalizedError, true);
  // Mark the ORIGINAL error object (not normalizedError, which may be a
  // freshly-constructed wrapper) so a subsequent `throw error;` by the
  // caller is recognized by onRequestError as already-logged.
  if (error instanceof Error) {
    markBridgeLogged(error);
  }
}

/**
 * Record non-error server-side signals that should still page the admin team.
 */
export async function logServerEvent(
  message: string,
  context: RoundErrorContext,
  severity: ServerTraceSeverity = 'info'
): Promise<void> {
  await captureServerTrace(message, context, severity);
}
