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
type CoachMode = 'recruiting' | 'team';
const RECRUITING_ROUTES = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
  '/baseball/dashboard/compare',
  '/baseball/dashboard/camps',
];
const ORG_ROUTES = [
  '/baseball/dashboard/organization',
];
const TEAM_ROUTES = [
  '/baseball/dashboard/team',
];
const RECRUITING_ALLOWED_COACH_TYPES: CoachType[] = ['college', 'juco'];

/**
 * Check if user is authorized to access the requested route based on their role
 */
interface SupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: { coach_type: string } | null; error: Error | null }>;
      };
    };
  };
}

async function checkRouteAuthorization(
  supabase: SupabaseClient,
  user: { id: string },
  pathname: string,
  coachMode: CoachMode
): Promise<{ authorized: boolean; redirectTo?: string }> {
  // Check if route requires recruiting access
  const isRecruitingRoute = RECRUITING_ROUTES.some(route =>
    pathname.startsWith(route)
  );
  const isOrgRoute = ORG_ROUTES.some(route =>
    pathname.startsWith(route)
  );
  const isTeamRoute = TEAM_ROUTES.some(route =>
    pathname.startsWith(route)
  );

  if (!isRecruitingRoute && !isTeamRoute && !isOrgRoute) {
    return { authorized: true };
  }

  // Fetch coach type
  const { data: coach, error } = await supabase
    .from('baseball_coaches')
    .select('coach_type')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    if (isTeamRoute || isOrgRoute) {
      return { authorized: true };
    }
    return { authorized: false, redirectTo: '/baseball/dashboard/team' };
  }

  if (isRecruitingRoute && !RECRUITING_ALLOWED_COACH_TYPES.includes(coach.coach_type as CoachType)) {
    return {
      authorized: false,
      redirectTo: '/baseball/dashboard/team'
    };
  }

  if (isOrgRoute && coach.coach_type !== 'showcase') {
    return {
      authorized: false,
      redirectTo: '/baseball/dashboard/team',
    };
  }

  if (isTeamRoute) {
    if (coach.coach_type === 'college') {
      return {
        authorized: false,
        redirectTo: '/baseball/dashboard',
      };
    }
    if (coach.coach_type === 'juco' && coachMode === 'recruiting') {
      return {
        authorized: false,
        redirectTo: '/baseball/dashboard',
      };
    }
  }

  if (coach.coach_type === 'juco') {
    if (isRecruitingRoute && coachMode === 'team') {
      return {
        authorized: false,
        redirectTo: '/baseball/dashboard/team',
      };
    }
    if (isTeamRoute && coachMode === 'recruiting') {
      return {
        authorized: false,
        redirectTo: '/baseball/dashboard',
      };
    }
    if (pathname === '/baseball/dashboard' && coachMode === 'team') {
      return {
        authorized: false,
        redirectTo: '/baseball/dashboard/team',
      };
    }
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

  // Public routes that don't need any session handling at all
  const isStaticPublicRoute = pathname === '/';

  // Allow truly static public routes without any session handling
  if (isStaticPublicRoute) {
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
          cookiesToSet.forEach(({ name, value }) =>
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
  const coachModeCookie = request.cookies.get('coach_mode')?.value;
  const coachMode: CoachMode = coachModeCookie === 'team' ? 'team' : 'recruiting';

  // Dashboard routes require full authentication (not onboarding routes)
  const isDashboardRoute = pathname.startsWith('/baseball/dashboard') ||
                           pathname.startsWith('/golf/dashboard');
  const isProtectedRoute = isDashboardRoute;

  // Redirect to login if accessing protected route without auth
  // Always redirect unauthenticated users - client-side will handle auth state
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    // Redirect to the sport-specific login page
    url.pathname = sport ? `/${sport}/login` : '/baseball/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Check role-based authorization for authenticated users
  if (user && isDashboardRoute) {
    const authResult = await checkRouteAuthorization(
      supabase as unknown as SupabaseClient,
      user,
      pathname,
      coachMode
    );
    if (!authResult.authorized && authResult.redirectTo) {
      return NextResponse.redirect(
        new URL(authResult.redirectTo, request.url)
      );
    }
  }

  // NOTE: We no longer redirect authenticated users from auth pages.
  // The login page will detect if user is already logged in and show
  // appropriate options (continue to dashboard or sign out).
  // This allows users to access /login to switch accounts if needed.

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
