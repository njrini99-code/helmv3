import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const rateLimitResult = withRateLimit(request, RATE_LIMITS.API_WRITE);
  if (rateLimitResult) {
    return rateLimitResult;
  }

  try {
    const errorReport = await request.json();
    const supabase = createAdminClient();

    const severityMap: Record<string, string> = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'critical',
    };

    await supabase.from('error_logs').insert({
      message: String(errorReport.message || 'Unknown error').slice(0, 2000),
      severity: severityMap[errorReport.severity] || 'error',
      stack: errorReport.stack ? String(errorReport.stack).slice(0, 8000) : null,
      context: errorReport.context || null,
      user_agent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      url: errorReport.url || null,
      user_id: errorReport.userId || null,
      timestamp: errorReport.timestamp || new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Error Logging Failed]', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
