import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Determine which sport context from the URL
 */
function getSportFromPath(pathname: string): 'baseball' | 'golf' | null {
  if (pathname.startsWith('/baseball')) return 'baseball';
  if (pathname.startsWith('/golf')) return 'golf';
  return null;
}

/**
 * Coach types that can access recruiting features
 */
type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';
const RECRUITING_ROUTES = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
  '/baseball/dashboard/compare',
  '/baseball/dashboard/camps',
];
const RECRUITING_ALLOWED_COACH_TYPES: CoachType[] = ['college', 'juco'];

/**
 * Check if user is authorized to access the requested route based on their role
 */
async function checkRouteAuthorization(
  supabase: any,
  user: any,
  pathname: string
): Promise<{ authorized: boolean; redirectTo?: string }> {
  // Check if route requires recruiting access
  const isRecruitingRoute = RECRUITING_ROUTES.some(route =>
    pathname.startsWith(route)
  );

  if (!isRecruitingRoute) {
    return { authorized: true };
  }

  // Fetch coach type
  const { data: coach, error } = await supabase
    .from('coaches')
    .select('coach_type')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    return { authorized: false, redirectTo: '/baseball/dashboard/team' };
  }

  if (!RECRUITING_ALLOWED_COACH_TYPES.includes(coach.coach_type as CoachType)) {
    return {
      authorized: false,
      redirectTo: '/baseball/dashboard/team'
    };
  }

  return { authorized: true };
}

/**
 * Create a Supabase client for use in Middleware
 * This refreshes the user's session and is called on every route
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sport = getSportFromPath(pathname);

  // Public routes that should always be accessible
  const isPublicRoute = pathname === '/' ||
                       pathname === '/baseball/login' ||
                       pathname === '/baseball/signup' ||
                       pathname === '/golf/login' ||
                       pathname === '/golf/signup' ||
                       pathname === '/baseball/coach-onboarding' ||  // Onboarding flows
                       pathname === '/baseball/coach' ||
                       pathname === '/baseball/player' ||
                       pathname === '/golf/coach-onboarding' ||
                       pathname === '/golf/coach' ||
                       pathname === '/golf/player' ||
                       pathname.startsWith('/baseball/player/') ||  // Public player profiles
                       pathname.startsWith('/golf/player/');        // Public player profiles

  // Allow public routes even in production
  if (isPublicRoute) {
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

  // Protected routes check - sport-specific
  const isAuthPage = pathname === '/baseball/login' ||
                     pathname === '/baseball/signup' ||
                     pathname === '/golf/login' ||
                     pathname === '/golf/signup';
  // Dashboard routes require full authentication (not onboarding routes)
  const isDashboardRoute = pathname.startsWith('/baseball/dashboard') ||
                           pathname.startsWith('/golf/dashboard');
  const isProtectedRoute = isDashboardRoute;

  // Redirect to login if accessing protected route without auth
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    // Redirect to the sport-specific login page
    url.pathname = sport ? `/${sport}/login` : '/baseball/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Check role-based authorization for authenticated users
  if (user && isDashboardRoute) {
    const authResult = await checkRouteAuthorization(supabase, user, pathname);
    if (!authResult.authorized && authResult.redirectTo) {
      return NextResponse.redirect(
        new URL(authResult.redirectTo, request.url)
      );
    }
  }

  // Redirect authenticated users from auth pages to their onboarding or dashboard
  if (user && isAuthPage && sport) {
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

      url.pathname = coachData?.onboarding_completed
        ? `/${sport}/dashboard`
        : `/${sport}/coach`;
    } else if (userData?.role === 'player') {
      // Check if player has completed onboarding
      const { data: playerData } = await supabase
        .from('players')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      url.pathname = playerData?.onboarding_completed
        ? `/${sport}/dashboard`
        : `/${sport}/player`;
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
