import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

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

  return await updateSession(request);
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
