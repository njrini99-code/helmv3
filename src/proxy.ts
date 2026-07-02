import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const NATIVE_UA_MARKER = 'HelmSportsLabsApp';

// Routes that belong to the app itself. Anything outside of these on a native
// request is treated as a marketing page and redirected away (App Store
// Guideline 3.1.1 — no membership/pricing surfaces inside the iOS app).
const APP_ROUTE_PREFIXES = [
  '/golf',
  '/baseball',
  '/admin',
  '/api',
  '/auth',
  '/support',
  '/privacy',
  '/terms',
  '/dev',
];

function isNativeUserAgent(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') ?? '';
  return ua.includes(NATIVE_UA_MARKER);
}

function isMarketingRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return !APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Proxy runs on every request to:
 * 1. Refresh the user's Supabase session
 * 2. Protect routes that require authentication
 * 3. Redirect authenticated users away from auth pages
 * 4. Redirect to appropriate dashboard based on user role
 *
 * The updateSession function is defined in lib/supabase/middleware.ts
 * and handles all auth logic including role-based redirects.
 *
 * SECURITY: Development mode bypass has been removed for security.
 * Use proper authentication even in development.
 */
export async function proxy(request: NextRequest) {
  // App Store Guideline 3.1.1: block marketing routes for native iOS requests.
  if (isNativeUserAgent(request) && isMarketingRoute(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/golf/login', request.url));
  }

  // Only bypass auth for specific dev design system routes if explicitly enabled
  const DEV_BYPASS_ROUTES = ['/dev/design-system', '/dev/components'];

  if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true') {
    const isDevRoute = DEV_BYPASS_ROUTES.some(route =>
      request.nextUrl.pathname.startsWith(route)
    );
    if (isDevRoute) {
      console.warn('⚠️ DEV MODE: Auth bypassed for', request.nextUrl.pathname);
      return NextResponse.next();
    }
  }

  try {
    return await updateSession(request);
  } catch (error) {
    // Supabase-js raises AuthApiError "Invalid Refresh Token: Refresh Token
    // Not Found" whenever a stale or already-rotated refresh-token cookie
    // arrives. That's normal background behaviour for logged-out users and
    // long-idle tabs — it should NOT surface as an error in Vercel logs.
    // Downgrade to a warning and let the request continue with no session.
    const message = error instanceof Error ? error.message : String(error);
    if (/refresh token/i.test(message)) {
      console.warn('[Proxy] Stale refresh token; treating session as logged out:', message);
    } else {
      console.warn('[Proxy] Session update failed:', message);
    }
    return NextResponse.next();
  }
}

/**
 * Configure which routes the middleware runs on
 * This matcher excludes:
 * - Static files (_next/static)
 * - Images (_next/image)
 * - Favicon
 * - Common image formats
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
