import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Create a Supabase client for use in Middleware
 * This refreshes the user's session and is called on every route
 */
export async function updateSession(request: NextRequest) {
  // Check if dev mode is enabled - check both NODE_ENV and if we're not in production
  const isDevMode = process.env.NODE_ENV === 'development' ||
                    process.env.NODE_ENV !== 'production' ||
                    !process.env.VERCEL;

  // Public routes that should always be accessible
  const isPublicRoute = request.nextUrl.pathname === '/' ||
                       request.nextUrl.pathname.startsWith('/dev') ||
                       request.nextUrl.pathname.startsWith('/login') ||
                       request.nextUrl.pathname.startsWith('/signup');

  // In dev mode, allow all routes without authentication
  // Also allow public routes even in production
  if (isDevMode || isPublicRoute) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes check
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/signup');
  const isOnboardingRoute = request.nextUrl.pathname.startsWith('/coach') ||
                            request.nextUrl.pathname.startsWith('/player');
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');
  const isProtectedRoute = isOnboardingRoute || isDashboardRoute;

  // Redirect to login if accessing protected route without auth
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users from auth pages to their onboarding or dashboard
  if (user && isAuthPage) {
    // Get user role and onboarding status from database
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const url = request.nextUrl.clone();

    if (userData?.role === 'coach') {
      // Check if coach has completed onboarding
      const { data: coachData } = await supabase
        .from('coaches')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      url.pathname = coachData?.onboarding_completed ? '/dashboard' : '/coach';
    } else if (userData?.role === 'player') {
      // Check if player has completed onboarding
      const { data: playerData } = await supabase
        .from('players')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      url.pathname = playerData?.onboarding_completed ? '/dashboard' : '/player';
    } else {
      url.pathname = '/';
    }
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
