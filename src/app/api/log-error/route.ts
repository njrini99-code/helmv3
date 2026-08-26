import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { checkRateLimit } from '@/lib/auth/rate-limit';
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
import {
  redactPiiDeep,
  collapseEmailsForGrouping,
  redactFreeTextForStorage,
} from '@/lib/observability/redact-pii';
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

/**
 * Strip the query string and fragment from a URL-shaped string. Mirrors
 * instrumentation-client.ts's `beforeSend` treatment of `event.request.url`
 * and `event.contexts.location`: either half can carry a Supabase magic-link
 * token (`?token_hash=...&type=magiclink`), a password-reset token, or an
 * OAuth code — none of which belongs in `error_logs`/`admin_events`. Applied
 * unconditionally to anything URL-shaped, same as the client-side filter, so
 * this doesn't depend on knowing every token param name in advance.
 *
 * Also matches a BARE query string or fragment (`?token_hash=...`,
 * `#access_token=...`), not just one embedded in a full URL:
 * `getBrowserDiagnostics()` in error-logging.ts sends `location.search` and
 * `location.hash` as their own standalone string fields (alongside `href`,
 * which already contains the same text) — a walker that only recognized
 * `scheme://` and a leading `/` let those two fields straight through.
 *
 * Non-URL strings (an incidental '?' or '#' in the middle of prose) pass
 * through untouched.
 */
function stripUrlSecrets(value: string): string {
  if (!value.includes('?') && !value.includes('#')) return value;
  const looksLikeUrl =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    value.startsWith('/') ||
    value.startsWith('?') ||
    value.startsWith('#');
  if (!looksLikeUrl) return value;
  return value.replace(/[?#].*$/, '');
}

/**
 * Report a redaction failure without becoming one. The shared
 * `redactFreeTextForStorage` returns a withheld-content placeholder either
 * way — this is telemetry about the failure, never the thing that decides
 * whether the row gets written.
 */
function reportRedactionFailure(error: unknown, field: 'message' | 'stack'): void {
  console.error(
    `[log-error route] ${field} redaction failed; persisting a placeholder instead of the raw value`,
    error,
  );
  try {
    Sentry.captureException(error, {
      tags: { component: 'log-error-route-redaction', field },
    });
  } catch {
    // Reporting must never block the write path.
  }
}

/** Bounds the recursive walk below — a pathological client payload must not turn this into a hang. */
const CONTEXT_REDACT_MAX_DEPTH = 8;

/** Recursively applies stripUrlSecrets to every string in a client-supplied context tree. */
function stripUrlSecretsDeep(value: unknown, depth = 0): unknown {
  if (depth > CONTEXT_REDACT_MAX_DEPTH) return value;
  if (typeof value === 'string') return stripUrlSecrets(value);
  if (Array.isArray(value)) return value.map((item) => stripUrlSecretsDeep(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stripUrlSecretsDeep(nested, depth + 1);
    }
    return out;
  }
  return value;
}

interface RedactedClientPayload {
  url: string | null;
  context: unknown;
}

/**
 * Redact client-supplied data before any of it reaches `error_logs`/
 * `admin_events`. Two independent hazards land in this same payload: a
 * magic-link/OAuth/reset token riding in a URL, referrer, or `location`
 * field, and an email address in free text (browser diagnostics, or a
 * caught error's own message copied into context). Token stripping is local
 * to this route (`stripUrlSecrets*` above); email masking reuses
 * `redactPiiDeep` — this repo's one PII scrubber, already relied on by the
 * Sentry `beforeSend` hooks for exactly this shape.
 *
 * Fail-open by contract: a bug in this function must never drop the error
 * report itself. On failure it still returns a usable value — the URL
 * trimmed by the cheapest possible means (a plain string split, which
 * cannot itself throw) and the context omitted entirely rather than risk
 * unredacted PII/tokens reaching storage.
 */
function redactClientPayloadForStorage(rawUrl: string | null, rawContext: unknown): RedactedClientPayload {
  try {
    const strippedContext = stripUrlSecretsDeep(rawContext);
    return {
      url: rawUrl ? stripUrlSecrets(rawUrl) : null,
      context: redactPiiDeep(strippedContext),
    };
  } catch (error) {
    console.error('[log-error route] PII/token redaction failed; persisting with context omitted', error);
    Sentry.captureException(error, { tags: { component: 'log-error-route-redaction' } });
    return {
      url: rawUrl ? (rawUrl.split(/[?#]/)[0] ?? null) : null,
      context: null,
    };
  }
}


/**
 * 30 requests / 60s per IP — the WRITE-tier budget this route has always
 * carried (`@/lib/rate-limit`'s `API_WRITE`, 30/60s). It is spelled out here
 * rather than imported because `@/lib/auth/rate-limit` — the durable,
 * Upstash-backed limiter this route moved to — has no `API_WRITE` bucket, and
 * its `API_GENERAL` is the 100/60s READ-tier budget. Borrowing API_GENERAL
 * would have tripled the per-IP cap on the one ANONYMOUS service-role write
 * path in the app, which is the opposite of the intent of moving here.
 */
const LOG_ERROR_RATE_LIMIT = { maxAttempts: 30, windowMs: 60 * 1000 };

export async function POST(request: NextRequest) {
  // This is the one route that accepts ANONYMOUS writes into error_logs +
  // admin_events via the service-role client, so its cap has to actually hold.
  // It used to run on `src/lib/rate-limit.ts`, whose store is a process-local
  // Map — on serverless that is per warm instance, so the effective cap was
  // (instances x limit) and reset on every cold start. `checkRateLimit` from
  // `@/lib/auth/rate-limit` is the limiter every other gated path already uses:
  // Upstash-KV-first (shared across instances and deploys), in-memory only as a
  // dev fallback. The leftmost X-Forwarded-For hop stays the key — on Vercel
  // the edge sets that header itself, and rewriting the parsing here would be a
  // guess at a platform contract rather than a fix. The BUDGET is unchanged by
  // that move — see LOG_ERROR_RATE_LIMIT above.
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const rateLimit = await checkRateLimit(`log-error:ip:${clientIp}`, LOG_ERROR_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      },
    );
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
    // Masked, not just the context: `error.message` is a free-text string the
    // client fully controls, and error-logging.ts's own enrichErrorContext
    // copies this exact string into context.error.message — which the
    // context redaction below already masks. Leaving this top-level column
    // raw would mask the same address in one place on the row and not the
    // other. Mirrors server-error-logger.ts's writeAdminTables, the other
    // write path into these same two tables.
    //
    // Both `message` and `stack` get the SAME redactFreeTextForStorage
    // treatment (see its doc comment) — `message` also feeds
    // `admin_events.title` below, so redacting it here covers both columns
    // in one place.
    const message = redactFreeTextForStorage(
      String(errorReport.message || 'Unknown error'),
      2000,
      (err) => reportRedactionFailure(err, 'message'),
    );
    const stack = errorReport.stack
      ? redactFreeTextForStorage(errorReport.stack, 8000, (err) =>
          reportRedactionFailure(err, 'stack'),
        )
      : null;

    // Redact BEFORE anything downstream touches this data. The client
    // controls both `url` and `context` entirely, and `context` typically
    // carries browser diagnostics (location.href, document.referrer) that
    // can hold a Supabase magic-link token or an OAuth code, plus free-text
    // fields that can hold an email address. See redactClientPayloadForStorage.
    const rawUrl = errorReport.url || request.headers.get('referer') || null;
    const redactedPayload = redactClientPayloadForStorage(rawUrl, errorReport.context);
    const url = redactedPayload.url;
    const redactedContext = redactedPayload.context;

    const timestamp = errorReport.timestamp || new Date().toISOString();
    const userAgent = request.headers.get('user-agent');
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

    // Same signature every other write path into admin_events computes
    // (server-error-logger.ts's writeAdminTables) — without it, repeats of
    // the same client-side root cause never collapse into one triage
    // bucket (mergeTriage falls back to a per-row key when fingerprint is
    // null), so a single network blip can flood the incident queue with
    // hundreds of individually-fingerprinted "network error" rows.
    //
    // Derived from the REDACTED context, not the raw one — getTraceRoute can
    // fall back to a nested `location.href`, which is exactly one of the
    // token-bearing fields redaction above already stripped.
    const traceRoute = getTraceRoute(redactedContext, url);
    const traceAction = getTraceAction(redactedContext);
    const trace = classifyTraceSurface(traceRoute, traceAction);
    const finalSport = readContextSport(redactedContext) ?? trace.sport;
    const finalFeature = (readContextString(redactedContext, 'feature') as FeatureKey | null) ?? trace.feature;

    const fingerprint = buildIncidentSignature({
      severity,
      errorCode: null,
      route: traceRoute ?? url,
      // Collapsed, not masked: the fingerprint groups by string equality, and
      // a per-address mask (`a***@x.edu` vs `b***@x.edu`) is still unique per
      // address — it would fragment one root cause into one incident per
      // reporter. Same split server-error-logger.ts already made.
      message: collapseEmailsForGrouping(message),
    });

    // Sanitize context field - limit size to prevent abuse. Applied to the
    // already-redacted context, never to the raw client payload.
    let sanitizedContext: Json | null = null;
    if (redactedContext) {
      try {
        const contextStr = JSON.stringify(redactedContext);
        if (contextStr.length <= 10000) {
          sanitizedContext = redactedContext as Json;
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
