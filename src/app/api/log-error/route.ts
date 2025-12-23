import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/middleware/rate-limit';
import { RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Apply rate limiting - prevent spam
  const rateLimitResult = withRateLimit(request, RATE_LIMITS.API_WRITE);
  if (rateLimitResult) {
    return rateLimitResult;
  }

  try {
    const errorReport = await request.json();

    // In production, you would:
    // 1. Store in database for analysis
    // 2. Send to external monitoring service
    // 3. Alert on critical errors

    // For now, just log server-side
    console.error('[Client Error]', {
      ...errorReport,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // TODO: Store in database
    /*
    await supabase.from('error_logs').insert({
      message: errorReport.message,
      severity: errorReport.severity,
      stack: errorReport.stack,
      context: errorReport.context,
      user_agent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for'),
      timestamp: errorReport.timestamp,
    });
    */

    return NextResponse.json({ success: true });
  } catch (error) {
    // Don't crash if error logging fails
    console.error('[Error Logging Failed]', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
