import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { shouldPersistAdminTables } from '@/lib/telemetry-gate';
import type { Json } from '@/lib/types/database';

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

    const errorReport = await request.json();
    const adminClient = createAdminClient();

    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };
    let severity = severityMap[errorReport.severity] || 'error';
    // Anonymous (pre-auth) reports are capped at 'error' — an unauthenticated
    // client claiming 'critical' should never page the on-call team the same
    // way an authenticated user's report does.
    if (isAnonymous && severity === 'critical') {
      severity = 'error';
    }
    const message = String(errorReport.message || 'Unknown error').slice(0, 2000);
    const stack = errorReport.stack ? String(errorReport.stack).slice(0, 8000) : null;
    const url = errorReport.url || request.headers.get('referer') || null;
    const timestamp = errorReport.timestamp || new Date().toISOString();
    const userAgent = request.headers.get('user-agent');
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

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
        ? { ...sanitizedContext, anonymous: isAnonymous }
        : { anonymous: isAnonymous, raw: sanitizedContext };

    const adminMetadata = {
      source: 'client_runtime',
      reportedSeverity: errorReport.severity || 'medium',
      timestamp,
      context: contextWithAnonymity,
      userAgent,
      ip,
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
      }),
    ]);

    if (errorLogResult.error || adminEventResult.error) {
      throw errorLogResult.error ?? adminEventResult.error;
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
