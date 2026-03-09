import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const rateLimitResult = withRateLimit(request, RATE_LIMITS.API_WRITE);
  if (rateLimitResult) {
    return rateLimitResult;
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const errorReport = await request.json();
    const adminClient = createAdminClient();

    const severityMap: Record<string, string> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };

    // Sanitize context field - limit size to prevent abuse
    let sanitizedContext = null;
    if (errorReport.context) {
      try {
        const contextStr = JSON.stringify(errorReport.context);
        if (contextStr.length <= 10000) {
          sanitizedContext = errorReport.context;
        }
      } catch {
        sanitizedContext = null;
      }
    }

    await adminClient.from('error_logs').insert({
      message: String(errorReport.message || 'Unknown error').slice(0, 2000),
      severity: severityMap[errorReport.severity] || 'error',
      stack: errorReport.stack ? String(errorReport.stack).slice(0, 8000) : null,
      context: sanitizedContext,
      user_agent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      url: errorReport.url || null,
      user_id: user.id,
      timestamp: errorReport.timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
