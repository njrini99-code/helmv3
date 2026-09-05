import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, formatTimeRemaining } from '@/lib/auth/supabase-rate-limit';
import { resolveClientIp } from '@/lib/security/client-ip';
import { resolveGolfCoachEntry } from '@/lib/golf/coach-entry-path';
import { observeAuthResult } from '@/lib/observability/supabase/observe-auth';

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
 * js/log-injection (#112, #113, #114): the three `console.warn` calls below
 * log the REJECTED `?next=` value verbatim — fully attacker-controlled, and
 * these are exactly the branches that fire when it looks malicious. A value
 * carrying `\n` or other control characters would forge what looks like a
 * separate log line to anyone reading raw log output. Strip control
 * characters and cap the length before logging; this changes only what
 * lands in logs, never `validateRedirectPath`'s actual decision.
 */
export function sanitizeForLog(value: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars for log safety
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
}

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
    console.warn('[Security] Invalid redirect attempted:', sanitizeForLog(path), {
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return { valid: false, path: defaultRedirect };
  }

  // Must not be protocol-relative
  if (path.startsWith('//')) {
    console.warn('[Security] Protocol-relative redirect blocked:', sanitizeForLog(path), {
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
    console.warn('[Security] Blocked invalid redirect attempt:', sanitizeForLog(path), {
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

  // Get client IP for rate limiting and logging.
  // resolveClientIp, not the raw header: this value keys the OAuth-callback
  // rate limit below, and the raw unsplit `x-forwarded-for` let a caller mint a
  // fresh bucket per request just by varying it (security scan finding F12).
  const ip = resolveClientIp(request.headers);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Rate limit OAuth callbacks to prevent abuse (10 per hour per IP)
  const rateLimit = await checkRateLimit(`oauth_callback:ip:${ip}`, {
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
      // A bad state/code on the OAuth + magic-link callback is a real defect
      // (brief §10 names it): the user already authenticated with the
      // provider and still lands back on a login page. `flow_state_expired`/
      // `flow_state_not_found`/`bad_code_verifier` classify as EXPECTED (a
      // stale or reused link), so an ordinary expired link stays silent.
      observeAuthResult({
        error,
        feature: 'auth_oauth_callback',
        action: 'exchange_code_for_session',
        operation: 'oauth',
      });
      console.error('[OAuth] Callback error:', {
        error: error.message,
        code: code.substring(0, 10) + '...', // Log partial code for debugging
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
      });

      // Detect sport from the `next` redirect parameter to send user to correct login page
      const errorLoginPath = next.path.startsWith('/golf') ? '/golf/login' : '/baseball/login';
      return NextResponse.redirect(new URL(`${errorLoginPath}?error=auth_failed`, requestUrl.origin));
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

      // Get user's sport from metadata or users table
      const userSport = data.user.user_metadata?.sport;

      // Determine sport: check for golf profiles, otherwise default to baseball
      let sport = userSport || 'baseball';

      // If no sport in metadata, check if user has golf profiles (parallel)
      if (!userSport) {
        const [{ data: golfCoachCheck }, { data: golfPlayerCheck }] = await Promise.all([
          supabase.from('golf_coaches').select('id').eq('user_id', data.user.id).limit(1).single(),
          supabase.from('golf_players').select('id').eq('user_id', data.user.id).limit(1).single(),
        ]);

        if (golfCoachCheck || golfPlayerCheck) {
          sport = 'golf';
        }
      }

      console.info('[OAuth] User sport detected:', {
        userId: data.user.id,
        sport,
        fromMetadata: !!userSport
      });

      // Check for GOLF profiles first if sport is golf (parallel)
      if (sport === 'golf') {
        const [{ data: golfCoach }, { data: golfPlayer }] = await Promise.all([
          supabase.from('golf_coaches').select('id, onboarding_completed').eq('user_id', data.user.id).single(),
          supabase.from('golf_players').select('id, onboarding_completed').eq('user_id', data.user.id).single(),
        ]);

        if (golfCoach) {
          // `!onboarding_completed -> '/golf/coach'` sent both a pending and an
          // approved assistant coach into NEW-PROGRAM onboarding, which
          // overwrites organization_id and detaches them from the program they
          // joined. resolveGolfCoachEntry keys on the golf_team_coach_staff row
          // instead — see lib/golf/coach-entry-path.ts.
          const entry = await resolveGolfCoachEntry(data.user.id);
          const destination = entry.path !== '/golf/dashboard'
            ? entry.path
            : (next.path.startsWith('/golf/') ? next.path : '/golf/dashboard');
          console.info('[OAuth] Redirecting golf coach to:', { destination, userId: data.user.id });
          return NextResponse.redirect(new URL(destination, requestUrl.origin));
        }

        if (golfPlayer) {
          const destination = !golfPlayer.onboarding_completed
            ? '/golf/player'
            : (next.path.startsWith('/golf/') ? next.path : '/golf/dashboard');
          console.info('[OAuth] Redirecting golf player to:', { destination, userId: data.user.id });
          return NextResponse.redirect(new URL(destination, requestUrl.origin));
        }

        // No golf profile exists - redirect to golf signup to create profile
        console.info('[OAuth] Golf user needs profile:', { userId: data.user.id, email: data.user.email });
        // Redirect to golf player onboarding by default (user can pick role there)
        return NextResponse.redirect(new URL('/golf/player', requestUrl.origin));
      }

      // Check for BASEBALL profiles (parallel)
      const [{ data: coach }, { data: player }] = await Promise.all([
        supabase.from('baseball_coaches').select('id, onboarding_completed').eq('user_id', data.user.id).single(),
        supabase.from('baseball_players').select('id, onboarding_completed').eq('user_id', data.user.id).single(),
      ]);

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
