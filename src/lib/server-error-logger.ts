'use server';

import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';
import { buildIncidentSignature, type IncidentSeverity } from '@/lib/admin/incident-grouping';

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

function normalizeContext(context: RoundErrorContext): Record<string, unknown> {
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

async function writeAdminTables(
  message: string,
  error: Error | null,
  context: RoundErrorContext,
  severity: ServerTraceSeverity
) {
  const admin = createAdminClient();
  const normalizedContext = normalizeContext(context);
  const url = buildUrl(context);
  const title = buildAdminTitle(message, context, severity);
  const stack = error?.stack?.slice(0, 8000) ?? null;
  const timestamp = new Date().toISOString();

  const errorLogInsert = admin.from('error_logs').insert({
    message: message.slice(0, 2000),
    severity,
    stack,
    context: normalizedContext as Json,
    user_id: context.userId ?? null,
    url,
    timestamp,
  });

  const dbFingerprint =
    context.dbFingerprint ??
    buildIncidentSignature({
      severity: severity as IncidentSeverity,
      errorCode: context.errorCode ?? null,
      route: context.route ?? context.url ?? null,
      message,
    });

  const adminEventInsert = admin.from('admin_events').insert({
    event_type: 'error',
    title,
    severity,
    message: message.slice(0, 10000),
    metadata: normalizedContext as Json,
    user_id: context.userId ?? null,
    user_email: context.userEmail ?? null,
    url,
    stack_trace: stack,
    browser_info: null,
    sport: context.sport ?? null,
    team_id: context.teamId ?? null,
    fingerprint: dbFingerprint,
    source: context.source ?? 'server_action',
    feature: context.feature ?? context.featureArea ?? null,
  });

  await Promise.allSettled([errorLogInsert, adminEventInsert]);
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

    scope.setContext('server_trace', normalizeContext(context));
    scope.setFingerprint(buildFingerprint(context, severity));

    // Route by severity: info/warning are messages (control-flow signals,
    // skipped-record counters, threshold starvation), error/critical are
    // exceptions. Without this split every logServerEvent(..., 'warning')
    // surfaced in Sentry as an Error issue, drowning out real bugs.
    // forceException=true preserves the original exception path for
    // logServerException callers who explicitly handed us an Error.
    const isMessage =
      !forceException && (severity === 'info' || severity === 'warning');
    if (isMessage) {
      Sentry.captureMessage(message, SENTRY_SEVERITY_MAP[severity] ?? 'warning');
    } else {
      Sentry.captureException(error ?? new Error(message));
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
  return message.includes('Dynamic server usage:');
}

/**
 * admin_events/error_logs are PROD incident feeds, but every runtime holding
 * prod Supabase creds wrote to them: CI dev servers (/home/runner/...), local
 * dev + `next start` (/Users/...), and Vercel preview/prod builds
 * (/vercel/path0/...). That noise buried real incidents in the Bridge. Only
 * the live production deployment gets to write; everything else keeps
 * console/Sentry visibility. ADMIN_EVENTS_FORCE_CAPTURE=1 is the escape
 * hatch for deliberately testing the pipeline from elsewhere.
 */
export function shouldPersistAdminTables(): boolean {
  if (process.env.ADMIN_EVENTS_FORCE_CAPTURE === '1') return true;
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  return process.env.VERCEL_ENV === 'production';
}

async function captureServerTrace(
  message: string,
  context: RoundErrorContext,
  severity: ServerTraceSeverity,
  error?: Error | null,
  forceException = false,
): Promise<void> {
  const normalizedError = error ?? new Error(message);

  // Skip, don't rethrow: callers already decide how the original error
  // propagates; our only job is to not record framework signals as incidents.
  if (isNextControlFlowError(message, error ?? null)) return;

  if (!context.skipSentry) {
    try {
      captureSentryTrace(message, normalizedError, context, severity, forceException);
    } catch {
      // Sentry should never block request handling.
    }
  }

  if (!shouldPersistAdminTables()) {
    console.error(`[ServerErrorLogger] (${severity}, not persisted off-prod)`, message, context.action ?? '');
    return;
  }

  try {
    await writeAdminTables(message, normalizedError, context, severity);
  } catch {
    console.error('[ServerErrorLogger] Failed to persist trace:', message, context);
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
