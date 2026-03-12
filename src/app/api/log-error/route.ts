import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/types/database';

export async function POST(request: NextRequest) {
  const rateLimitResult = withRateLimit(request, RATE_LIMITS.API_WRITE);
  if (rateLimitResult) {
    return rateLimitResult;
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const errorReport = await request.json();
    const adminClient = createAdminClient();

    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };
    const severity = severityMap[errorReport.severity] || 'error';
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

    const adminMetadata = {
      source: 'client_runtime',
      reportedSeverity: errorReport.severity || 'medium',
      timestamp,
      context: sanitizedContext,
      userAgent,
      ip,
    } as Json;

    const [errorLogResult, adminEventResult] = await Promise.all([
      adminClient.from('error_logs').insert({
        message,
        severity,
        stack,
        context: sanitizedContext,
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
        browser_info: sanitizedContext,
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
