import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * updateSession throws `NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder`
 * / `NEXT_PUBLIC_SUPABASE_ANON_KEY is missing` (src/lib/supabase/middleware.ts)
 * when the Supabase env vars aren't configured for this deploy. That is a
 * deploy-time MISCONFIGURATION, not a transient runtime failure — matched by
 * message since that guard-throw lives in a separate file this middleware
 * doesn't otherwise need to import from.
 */
function isConfigError(error: unknown): boolean {
  return error instanceof Error && /NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)/.test(error.message);
}

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    if (isConfigError(error)) {
      // FAIL CLOSED: this specific error means Supabase env vars are missing
      // or placeholders, so updateSession never even reached auth.getUser().
      // Failing open here (as EVERY error used to, via a bare console.warn +
      // NextResponse.next()) would silently disable every auth/authorization
      // check in the app for the duration of the misconfiguration — every
      // request to every protected /baseball, /golf, /lifting, and /admin
      // dashboard route would pass straight through with NO session
      // validation at all. A loud 500 is far safer than a silent open door.
      Sentry.captureException(error, {
        level: 'fatal',
        tags: { middleware_failure: 'config' },
      });
      return new NextResponse('Service temporarily unavailable. Please try again shortly.', {
        status: 500,
      });
    }

    // Genuinely transient (a network blip talking to Supabase/GoTrue, a
    // read failure inside checkRouteAuthorization, cookie parsing edge
    // cases, …) — capture to Sentry for visibility (previously only a
    // console.warn, invisible in production unless someone was tailing
    // logs), but keep failing OPEN: a temporary Supabase/GoTrue hiccup must
    // not lock every signed-in user out of the entire app. Route-level
    // guards (getSessionProfile/server-route-guards, requireBaseballAction,
    // etc.) remain the backstop for any request that slips through here.
    Sentry.captureException(error, {
      level: 'warning',
      tags: { middleware_failure: 'transient' },
    });
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (images, fonts, etc.)
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
