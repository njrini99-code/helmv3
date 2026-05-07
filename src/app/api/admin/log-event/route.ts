import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// ============================================
// CORS
// ============================================

const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

// ============================================
// TYPES
// ============================================

interface LogEventPayload {
  eventType: string;
  title: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  message?: string;
  metadata?: Record<string, unknown>;
  url?: string;
  stackTrace?: string;
  browserInfo?: Record<string, unknown>;
}

// ============================================
// RATE LIMITING (Simple in-memory)
// ============================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

// ============================================
// VALIDATION
// ============================================

const VALID_EVENT_TYPES = [
  'error',
  'signup',
  'login',
  'round_submitted',
  'ai_generation',
  'feature_use',
  'onboarding',
  'security',
  'system',
  'subscription',
  'api',
];

const VALID_SEVERITIES = ['info', 'warning', 'error', 'critical'];

function validatePayload(payload: unknown): payload is LogEventPayload {
  if (!payload || typeof payload !== 'object') return false;
  
  const p = payload as Record<string, unknown>;
  
  // Required fields
  if (typeof p.eventType !== 'string' || !VALID_EVENT_TYPES.includes(p.eventType)) return false;
  if (typeof p.title !== 'string' || p.title.length === 0 || p.title.length > 500) return false;
  
  // Optional fields with validation
  if (p.severity !== undefined && (typeof p.severity !== 'string' || !VALID_SEVERITIES.includes(p.severity))) return false;
  if (p.message !== undefined && typeof p.message !== 'string') return false;
  if (p.url !== undefined && typeof p.url !== 'string') return false;
  if (p.stackTrace !== undefined && typeof p.stackTrace !== 'string') return false;
  if (p.metadata !== undefined && (typeof p.metadata !== 'object' || Array.isArray(p.metadata))) return false;
  if (p.browserInfo !== undefined && (typeof p.browserInfo !== 'object' || Array.isArray(p.browserInfo))) return false;
  
  return true;
}

// ============================================
// ABORT DETECTION
// ============================================

/**
 * Detects whether a thrown error is a client-side abort (the user closed the
 * tab, navigated away, or the connection dropped mid-request). Node's undici
 * surfaces these as `AbortError`, `cause.code === 'UND_ERR_ABORTED'`, or
 * `name === 'AbortError'`. They are not actionable — the request never
 * completed, so we should short-circuit cleanly without logging an error.
 */
function isClientAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err !== 'object') return false;

  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string; name?: string } };

  if (e.name === 'AbortError') return true;
  if (e.code === 'ABORT_ERR' || e.code === 'UND_ERR_ABORTED') return true;
  if (e.cause?.code === 'UND_ERR_ABORTED' || e.cause?.code === 'ABORT_ERR') return true;
  if (e.cause?.name === 'AbortError') return true;

  // Fallback string match — undici sometimes throws a bare `Error: aborted`
  // with no useful structured fields.
  const msg = (e.message ?? '').toLowerCase();
  if (msg === 'aborted' || msg === 'request aborted' || msg.includes('the operation was aborted')) {
    return true;
  }
  return false;
}

// ============================================
// SANITIZATION
// ============================================

function sanitizeString(str: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  return str.slice(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
}

function sanitizePayload(payload: LogEventPayload): LogEventPayload {
  return {
    eventType: payload.eventType,
    title: sanitizeString(payload.title, 500),
    severity: payload.severity ?? 'info',
    message: payload.message ? sanitizeString(payload.message, 10000) : undefined,
    url: payload.url ? sanitizeString(payload.url, 2000) : undefined,
    stackTrace: payload.stackTrace ? sanitizeString(payload.stackTrace, 50000) : undefined,
    metadata: payload.metadata,
    browserInfo: payload.browserInfo,
  };
}

// ============================================
// HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Require authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse body
    let body: unknown;
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      body = await request.json();
    } else {
      // Handle sendBeacon which sends as text/plain
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON' },
          { status: 400 }
        );
      }
    }
    
    // Validate
    if (!validatePayload(body)) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }
    
    // Sanitize
    const sanitized = sanitizePayload(body);

    // Insert using service-role admin client. RLS on admin_events restricts INSERT
    // to service_role only (see migration 20260214220000_create_admin_events.sql);
    // the user-scoped client is denied with code 42501. We've already authenticated
    // the user above, so it's safe to use the privileged client to persist the row.
    type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
    const adminDb = createAdminClient();
    const { data, error } = await adminDb
      .from('admin_events')
      .insert({
        event_type: sanitized.eventType,
        title: sanitized.title,
        severity: (sanitized.severity ?? 'info') as 'info' | 'warning' | 'error' | 'critical',
        message: sanitized.message ?? null,
        metadata: (sanitized.metadata ?? {}) as Json,
        url: sanitized.url ?? null,
        stack_trace: sanitized.stackTrace ?? null,
        browser_info: (sanitized.browserInfo ?? null) as Json,
        user_id: user.id,
      })
      .select('id')
      .single();
    
    if (error) {
      await logServerError(`[log-event] Database error: ${describeError(error)}`, { action: 'route.POST' });
      return NextResponse.json(
        { error: 'Failed to log event' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    // Client closed the connection mid-request (navigated away, closed tab,
    // network dropped). The request never completed, so there's nothing
    // actionable here — log at debug only and short-circuit. We can't
    // actually return a useful response since the socket is gone.
    if (isClientAbortError(err)) {
      console.debug('[log-event] client aborted request');
      return new NextResponse(null, { status: 499 });
    }
    await logServerError(`[log-event] Unexpected error: ${describeError(err)}`, { action: 'route.POST' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================
// OPTIONS (CORS preflight)
// ============================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}
