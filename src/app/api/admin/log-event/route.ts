import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';
import { logServerError } from '@/lib/server-error-logger';
import { shouldPersistAdminTables } from '@/lib/telemetry-gate';
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

// Full set of admin_event types — includes server-only categories that the
// server-side admin-logger.ts emits directly via createAdminClient(). This
// route is the CLIENT-CALLABLE entrypoint and must not accept the server-only
// categories below or admins can't trust the incident feed.
const SERVER_ONLY_EVENT_TYPES = [
  'security',       // Failed logins, RLS denials — server emits, not client
  'signup',         // Server-emitted on auth completion
  'login',          // Server-emitted on auth completion
  'round_submitted',// Server-emitted on submit_round_atomic
  'ai_generation',  // Server-emitted from CoachHelm pipeline
  'subscription',   // Server-emitted from billing webhooks
  'api',            // Server-emitted from API perf log
] as const;

// Client-callable event types. Anything outside this list from the client is
// rejected with 403, regardless of authentication status. user_id is still
// server-bound on the insert.
const CLIENT_ALLOWED_EVENT_TYPES = [
  'error',        // Client runtime errors (window.onerror, React errors)
  'feature_use',  // Client-side feature instrumentation
  'onboarding',   // Client-side onboarding milestone hits
  'system',       // Client perf telemetry (slow page loads) — capped severity below
] as const;

const VALID_EVENT_TYPES = [
  ...CLIENT_ALLOWED_EVENT_TYPES,
  ...SERVER_ONLY_EVENT_TYPES,
];

const VALID_SEVERITIES = ['info', 'warning', 'error', 'critical'];

// Per-event-type ceiling on client-claimed severity. Clients cannot post
// "critical" anything — that label is reserved for server-emitted incidents.
const CLIENT_MAX_SEVERITY: Record<string, 'info' | 'warning' | 'error'> = {
  error: 'error',         // a real client crash IS at most 'error'
  feature_use: 'info',    // usage telemetry is informational
  onboarding: 'info',     // milestone hit is informational
  system: 'warning',      // slow page load tops out at warning, never critical
};

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

function clampClientSeverity(
  eventType: string,
  requested: 'info' | 'warning' | 'error' | 'critical' | undefined,
): 'info' | 'warning' | 'error' | 'critical' {
  const ceiling = CLIENT_MAX_SEVERITY[eventType] ?? 'info';
  const req: 'info' | 'warning' | 'error' | 'critical' = requested ?? 'info';
  const reqRank = SEVERITY_RANK[req] ?? 0;
  const ceilingRank = SEVERITY_RANK[ceiling] ?? 0;
  return reqRank > ceilingRank ? ceiling : req;
}

function validatePayload(payload: unknown): payload is LogEventPayload {
  if (!payload || typeof payload !== 'object') return false;
  
  const p = payload as Record<string, unknown>;
  
  // Required fields
  if (typeof p.eventType !== 'string' || !(VALID_EVENT_TYPES as readonly string[]).includes(p.eventType)) return false;
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
  // Off-prod runtimes (CI dev servers, local dev, previews) hold prod
  // Supabase creds — gate so their events never enter the prod incident feed.
  if (!shouldPersistAdminTables()) {
    return NextResponse.json({ success: true, persisted: false });
  }

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

    // Read body defensively. sendBeacon flushes (tab close, navigation,
    // aborted requests) can arrive empty or truncated regardless of the
    // declared content-type, and request.json() throws a raw SyntaxError
    // on those — which used to escape uncaught to the outer catch below
    // and mint a logServerError incident for every dropped beacon (an
    // error-logging endpoint that errors on bad input creates a noise
    // loop). Read as text first so empty/malformed bodies get a clean,
    // un-logged response; logServerError stays reserved for genuine
    // internal failures after a valid body is parsed.
    const raw = await request.text();
    if (!raw.trim()) {
      return new NextResponse(null, { status: 204 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Validate
    if (!validatePayload(body)) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    // Reject server-only event types from client posts. These can only come
    // through src/lib/admin-logger.ts (server-side, createAdminClient()).
    // Without this gate, a logged-in player could fabricate fake "security"
    // or "api" events that poison the admin incident feed.
    if (!(CLIENT_ALLOWED_EVENT_TYPES as readonly string[]).includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Event type not allowed for client posts' },
        { status: 403 }
      );
    }

    // Sanitize
    const sanitized = sanitizePayload(body);
    // Clamp severity per event-type ceiling — clients cannot claim critical.
    sanitized.severity = clampClientSeverity(sanitized.eventType, sanitized.severity);

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
