import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { shouldPersistAdminTables, getRuntimeEnv } from '@/lib/telemetry-gate';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';
import {
  classifyTraceSurface,
  getTraceAction,
  getTraceRoute,
  type TraceSport,
} from '@/lib/error-trace-classification';
import type { FeatureKey } from '@/lib/admin/feature-registry';
import type { Json } from '@/lib/types/database';

function readContextString(context: unknown, key: string): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const value = (context as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readContextSport(context: unknown): TraceSport | null {
  const sport = readContextString(context, 'sport');
  return sport === 'golf' || sport === 'baseball' || sport === 'shared' ? sport : null;
}

export async function POST(request: NextRequest) {
  const rateLimitResult = withRateLimit(request, RATE_LIMITS.API_WRITE);
  if (rateLimitResult) {
    return rateLimitResult;
  }

  // Off-prod runtimes (CI dev servers, local dev/next start, previews) hold
  // prod Supabase creds — without this gate their client errors land in the
  // prod incident feed with /home/runner and /Users/... stack traces.
  if (!shouldPersistAdminTables()) {
    return NextResponse.json({ success: true, persisted: false });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // Was: 401 for unauthenticated users — which blinded us to login/signup
    // flow client errors (they reached Sentry but never error_logs).
    // Anonymous writes are accepted, flagged, and severity-capped.
    const isAnonymous = !user;

    // Read body defensively. sendBeacon flushes (tab close, navigation,
    // aborted requests) can arrive empty or truncated, and request.json()
    // throws a raw SyntaxError on those — which used to fall through to
    // the bare catch below and return a generic 500 for what is really a
    // client-side no-op. Read as text first so empty/malformed bodies get
    // a clean, cheap response instead of being treated as a server failure.
    const raw = await request.text();
    if (!raw.trim()) {
      return new NextResponse(null, { status: 204 });
    }

    let rawReport: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
      }
      rawReport = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Pluck fields into known types up front — the payload is client-
    // supplied JSON (typed `unknown` after parsing), and everything below
    // is inserted into typed Supabase columns.
    const errorReport = {
      severity: typeof rawReport.severity === 'string' ? rawReport.severity : undefined,
      message: typeof rawReport.message === 'string' ? rawReport.message : undefined,
      stack: typeof rawReport.stack === 'string' ? rawReport.stack : undefined,
      url: typeof rawReport.url === 'string' ? rawReport.url : undefined,
      timestamp: typeof rawReport.timestamp === 'string' ? rawReport.timestamp : undefined,
      context: rawReport.context,
    };

    const adminClient = createAdminClient();

    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };
    let severity = (errorReport.severity && severityMap[errorReport.severity]) || 'error';
    // Anonymous (pre-auth) reports are capped at 'error' — an unauthenticated
    // client claiming 'critical' should never page the on-call team the same
    // way an authenticated user's report does.
    if (isAnonymous && severity === 'critical') {
      severity = 'error';
    }
    const message = String(errorReport.message || 'Unknown error').slice(0, 2000);
    const stack = errorReport.stack ? errorReport.stack.slice(0, 8000) : null;
    const url = errorReport.url || request.headers.get('referer') || null;
    const timestamp = errorReport.timestamp || new Date().toISOString();
    const userAgent = request.headers.get('user-agent');
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

    // Same signature every other write path into admin_events computes
    // (server-error-logger.ts's writeAdminTables) — without it, repeats of
    // the same client-side root cause never collapse into one triage
    // bucket (mergeTriage falls back to a per-row key when fingerprint is
    // null), so a single network blip can flood the incident queue with
    // hundreds of individually-fingerprinted "network error" rows.
    const traceRoute = getTraceRoute(errorReport.context, url);
    const traceAction = getTraceAction(errorReport.context);
    const trace = classifyTraceSurface(traceRoute, traceAction);
    const finalSport = readContextSport(errorReport.context) ?? trace.sport;
    const finalFeature = (readContextString(errorReport.context, 'feature') as FeatureKey | null) ?? trace.feature;

    const fingerprint = buildIncidentSignature({
      severity,
      errorCode: null,
      route: traceRoute ?? url,
      message,
    });

    // Sanitize context field - limit size to prevent abuse
    let sanitizedContext: Json | null = null;
    if (errorReport.context) {
      try {
        const contextStr = JSON.stringify(errorReport.context);
        if (contextStr.length <= 10000) {
          sanitizedContext = errorReport.context as Json;
        }
      } catch {
        sanitizedContext = null;
      }
    }

    // Flag anonymous reports in the context jsonb itself, not just the
    // (nullable) user_id column — this survives joins/exports and lets the
    // admin feed distinguish "no user found" from "genuinely anonymous".
    const contextWithAnonymity: Json =
      sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext)
        ? {
            ...sanitizedContext,
            anonymous: isAnonymous,
            route: traceRoute,
            action: traceAction,
            sport: finalSport,
            feature: finalFeature,
          }
        : {
            anonymous: isAnonymous,
            raw: sanitizedContext,
            route: traceRoute,
            action: traceAction,
            sport: finalSport,
            feature: finalFeature,
          };

    const adminMetadata = {
      source: 'client',
      route: traceRoute,
      action: traceAction,
      sport: finalSport,
      feature: finalFeature,
      reportedSeverity: errorReport.severity || 'medium',
      timestamp,
      context: contextWithAnonymity,
      userAgent,
      ip,
      // Only reached when shouldPersistAdminTables() is true, so this is
      // always 'production' in practice — tagged explicitly so a future
      // gate regression is visible in the row itself.
      runtimeEnv: getRuntimeEnv(),
    } as Json;

    const [errorLogResult, adminEventResult] = await Promise.all([
      adminClient.from('error_logs').insert({
        message,
        severity,
        stack,
        context: contextWithAnonymity,
        user_agent: userAgent,
        ip,
        url,
        user_id: user?.id ?? null,
        timestamp,
      }),
      adminClient.from('admin_events').insert({
        event_type: 'error',
        title: severity === 'critical' ? `Critical client error: ${message}`.slice(0, 500) : `Client error: ${message}`.slice(0, 500),
        severity,
        message,
        metadata: adminMetadata,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        url,
        stack_trace: stack,
        browser_info: contextWithAnonymity,
        fingerprint,
        source: 'client',
        sport: finalSport as TraceSport | null,
        feature: finalFeature,
      }),
    ]);

    if (errorLogResult.error || adminEventResult.error) {
      throw errorLogResult.error ?? adminEventResult.error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // This route IS the error-reporting pipeline — a failure here has no
    // downstream logger to fall back on, so it must self-report directly.
    console.error('[log-error route] Failed to persist client error report', error);
    Sentry.captureException(error, { tags: { component: 'log-error-route' } });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
