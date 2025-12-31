import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, formatTimeRemaining } from '@/lib/auth/rate-limit';

// Whitelist of allowed redirect paths to prevent open redirect attacks
const ALLOWED_REDIRECTS = [
  '/baseball/dashboard',
  '/baseball/login',
  '/baseball/player',
  '/baseball/coach',
  '/baseball/complete-signup',
  '/baseball/coach-onboarding',
  '/golf/dashboard',
  '/golf/login',
  '/golf/player',
  '/golf/coach',
  '/golf/complete-signup',
];

/**
 * Validates and sanitizes redirect path to prevent open redirect vulnerability
 * Only allows internal paths starting with /baseball/ or /golf/
 */
function validateRedirectPath(
  path: string | null,
  request: NextRequest
): { valid: boolean; path: string } {
  const defaultRedirect = '/baseball/login';

  if (!path) {
    return { valid: true, path: defaultRedirect };
  }

  // Must start with /
  if (!path.startsWith('/')) {
    console.warn('[Security] Invalid redirect attempted:', path, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return { valid: false, path: defaultRedirect };
  }

  // Must not be protocol-relative
  if (path.startsWith('//')) {
    console.warn('[Security] Protocol-relative redirect blocked:', path, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return { valid: false, path: defaultRedirect };
  }

  // Check whitelist or allowed prefixes
  const allowedPrefixes = ['/baseball/', '/golf/'];
  const isAllowed = ALLOWED_REDIRECTS.includes(path) ||
                   allowedPrefixes.some(prefix => path.startsWith(prefix));

  if (!isAllowed) {
    console.warn('[Security] Blocked invalid redirect attempt:', path, {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return { valid: false, path: defaultRedirect };
  }

  return { valid: true, path };
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next');
  const next = validateRedirectPath(rawNext, request);

  // Get client IP for rate limiting and logging
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Rate limit OAuth callbacks to prevent abuse (10 per hour per IP)
  const rateLimit = checkRateLimit(`oauth_callback:ip:${ip}`, {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  });

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());

    console.warn('[Security] OAuth callback rate limit exceeded:', {
      ip,
      userAgent,
      resetAt: new Date(rateLimit.resetAt).toISOString(),
      blockedUntil: rateLimit.blockedUntil ? new Date(rateLimit.blockedUntil).toISOString() : undefined,
    });

    return NextResponse.redirect(
      new URL(`/baseball/login?error=rate_limit&retry_in=${encodeURIComponent(remaining)}`, requestUrl.origin)
    );
  }

  if (code) {
    const supabase = await createClient();

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[OAuth] Callback error:', {
        error: error.message,
        code: code.substring(0, 10) + '...', // Log partial code for debugging
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.redirect(new URL('/baseball/login?error=auth_failed', requestUrl.origin));
    }

    if (data.user) {
      // Log successful OAuth authentication
      console.info('[OAuth] Successful authentication:', {
        userId: data.user.id,
        email: data.user.email,
        provider: data.user.app_metadata.provider,
        ip,
        timestamp: new Date().toISOString(),
      });

      // Check if user has a coach or player profile
      const { data: coach } = await supabase
        .from('coaches')
        .select('id, onboarding_completed')
        .eq('user_id', data.user.id)
        .single();

      const { data: player } = await supabase
        .from('players')
        .select('id, onboarding_completed')
        .eq('user_id', data.user.id)
        .single();

      // Determine redirect based on profile status
      if (coach) {
        const destination = !coach.onboarding_completed ? '/baseball/coach' : '/baseball/dashboard';
        console.info('[OAuth] Redirecting coach to:', { destination, userId: data.user.id });
        return NextResponse.redirect(new URL(destination, requestUrl.origin));
      }

      if (player) {
        const destination = !player.onboarding_completed ? '/baseball/player' : '/baseball/dashboard';
        console.info('[OAuth] Redirecting player to:', { destination, userId: data.user.id });
        return NextResponse.redirect(new URL(destination, requestUrl.origin));
      }

      // No profile exists - redirect to complete signup
      // This handles OAuth users who need to create their profile
      console.info('[OAuth] New OAuth user needs profile:', { userId: data.user.id, email: data.user.email });
      return NextResponse.redirect(new URL('/baseball/complete-signup', requestUrl.origin));
    }
  }

  // No code - redirect to login
  return NextResponse.redirect(new URL(next.path, requestUrl.origin));
}
