import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_BASEBALL_TEAM_COOKIE } from '@/lib/baseball/active-context-shared';
import { getDefaultProgramSettings } from '@/lib/baseball/program-type-variants';
import { evaluateAdminGate, isAdminPath } from '@/lib/admin/super-admin-shared';
import {
  SESSION_IDLE_COOKIE,
  SESSION_IDLE_COOKIE_MAX_AGE_S,
  isSessionIdleExpired,
  parseLastActivity,
} from '@/lib/auth/session-idle-shared';

/**
 * STAFF_CAPABILITY_ROUTES — the middleware mirror of every nav-registry entry
 * that declares a `requiredCapability`, mapping its route href to the baseball
 * capability key a staffer must hold to reach it. This is the defense-in-depth
 * layer: an unauthorized staffer is redirected BEFORE the page renders, not just
 * shown the page's own authorized:false envelope.
 *
 * CONTRACT (locked by nav-capability-gating.test.ts):
 *   - every BASEBALL_NAV_REGISTRY entry with a requiredCapability appears here
 *     with the SAME capability;
 *   - every entry here maps to a known capability and a real registry surface,
 *     EXCEPT the allowlisted finer write sub-route /baseball/dashboard/stats/upload
 *     (a write sub-route of Stats Center with no own registry row).
 *
 * Pure config — no DB. Edits to the registry's requiredCapability map must be
 * mirrored here or CI fails.
 *
 * updateSession enforces this map for authenticated Baseball dashboard requests.
 */
export const STAFF_CAPABILITY_ROUTES: Array<[string, string]> = [
  ['/baseball/dashboard/import', 'can_manage_imports'],
  ['/baseball/dashboard/practice-effectiveness', 'can_manage_practice'],
  ['/baseball/dashboard/postgame', 'can_manage_stats'],
  ['/baseball/dashboard/decision-room', 'can_manage_settings'],
  ['/baseball/dashboard/settings/staff', 'can_invite_staff'],
  ['/baseball/dashboard/settings/program', 'can_manage_settings'],
  ['/baseball/dashboard/compare', 'can_manage_roster'],
  ['/baseball/dashboard/comparisons', 'can_manage_roster'],
  ['/baseball/dashboard/scout-packets', 'can_export_reports'],
  ['/baseball/dashboard/academics', 'can_view_academics'],
  ['/baseball/dashboard/organization', 'can_manage_settings'],
  ['/baseball/dashboard/teams', 'can_manage_settings'],
  ['/baseball/dashboard/program', 'can_manage_settings'],
  // Allowlisted write sub-route of Stats Center (no own registry entry).
  ['/baseball/dashboard/stats/upload', 'can_manage_stats'],
];

/**
 * Determine which sport context from the URL
 */
function getSportFromPath(pathname: string): 'baseball' | 'golf' | 'lifting' | null {
  if (pathname.startsWith('/baseball')) return 'baseball';
  if (pathname.startsWith('/golf')) return 'golf';
  if (pathname.startsWith('/lifting')) return 'lifting';
  return null;
}

/**
 * Native app requests use the same auth/access policy as desktop web for app
 * routes, but are kept away from marketing/pricing surfaces.
 */
const NATIVE_UA_MARKER = 'HelmSportsLabsApp';
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
] as const;

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
 * Program-aware Baseball route gates. These mirror the server page guards and
 * intentionally do not read viewport or mobile/desktop state.
 */
type BaseballProgramType = 'college' | 'high_school' | 'showcase' | 'juco' | 'academy' | 'club';
const BASEBALL_PROGRAM_TYPES = new Set<string>([
  'college',
  'high_school',
  'showcase',
  'juco',
  'academy',
  'club',
]);
const RECRUITING_ROUTES = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
  '/baseball/dashboard/compare',
  '/baseball/dashboard/comparisons',
  '/baseball/dashboard/college-interest',
  '/baseball/dashboard/scout-packets',
  '/baseball/dashboard/camps',
];
const ORG_ROUTES = [
  '/baseball/dashboard/organization',
  '/baseball/dashboard/teams',
  '/baseball/dashboard/events',
];
const ACADEMICS_ROUTES = ['/baseball/dashboard/academics'];
const LEGACY_TEAM_ROUTES = ['/baseball/dashboard/team'];
const RECRUITING_PROGRAM_TYPES = new Set<BaseballProgramType>([
  'college',
  'juco',
  'showcase',
  'academy',
  'club',
]);
const ORG_PROGRAM_TYPES = new Set<BaseballProgramType>(['showcase', 'academy', 'club']);
/** Canonical coach dashboard landing (replaces legacy /baseball/dashboard/team). */
const COACH_HOME = '/baseball/dashboard/command-center';
const PLAYER_HOME = '/baseball/player/today';

/**
 * Bookmark-compat redirects for legacy per-type landing stubs removed once the
 * canonical Fairway dashboard routes shipped. Checked before auth so old links
 * never 404.
 */
const LEGACY_BASEBALL_ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  '/baseball/coach/college': COACH_HOME,
  '/baseball/coach/high-school': COACH_HOME,
  '/baseball/coach/juco': COACH_HOME,
  '/baseball/coach/showcase': COACH_HOME,
  '/baseball/player/college': PLAYER_HOME,
  '/baseball/player/high-school': PLAYER_HOME,
  '/baseball/player/juco': PLAYER_HOME,
  '/baseball/player/showcase': PLAYER_HOME,
  '/baseball/dashboard/team/high-school': COACH_HOME,
  '/baseball/dashboard/stats/games/new': '/baseball/dashboard/stats/games/create',
};

function legacyBaseballRedirectTarget(pathname: string): string | null {
  return LEGACY_BASEBALL_ROUTE_REDIRECTS[pathname] ?? null;
}

/**
 * Check if user is authorized to access the requested route based on their role
 */
interface SupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
        single: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }>;
      };
      in?: (column: string, values: string[]) => {
        order: (column: string, options?: { ascending?: boolean }) =>
          Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>;
      };
    };
  };
}

function pathStartsWithAny(pathname: string, routes: readonly string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function normalizeProgramType(raw: unknown): BaseballProgramType | null {
  return typeof raw === 'string' && BASEBALL_PROGRAM_TYPES.has(raw)
    ? (raw as BaseballProgramType)
    : null;
}

function routeCapability(pathname: string): string | null {
  let best: { route: string; cap: string } | null = null;
  for (const [route, cap] of STAFF_CAPABILITY_ROUTES) {
    if ((pathname === route || pathname.startsWith(`${route}/`)) && (!best || route.length > best.route.length)) {
      best = { route, cap };
    }
  }
  return best?.cap ?? null;
}

function staffHasCapability(row: Record<string, unknown>, cap: string): boolean {
  const status = typeof row.status === 'string' ? row.status : null;
  if (status && ['suspended', 'removed', 'invited'].includes(status)) return false;
  if (row.is_primary === true || row.is_head_coach === true) return true;
  if (row[cap] === true) return true;
  if (cap === 'can_message_players' && row.can_message_team === true) return true;

  const json = row.capabilities;
  if (Array.isArray(json)) {
    return json.includes(cap) || (cap === 'can_message_players' && json.includes('can_message_team'));
  }
  if (json && typeof json === 'object') {
    const caps = json as Record<string, unknown>;
    return caps[cap] === true || (cap === 'can_message_players' && caps.can_message_team === true);
  }
  return false;
}

async function checkRouteAuthorization(
  supabase: SupabaseClient,
  user: { id: string },
  pathname: string,
  activeTeamCookie: string | null,
): Promise<{ authorized: boolean; redirectTo?: string }> {
  const isRecruitingRoute = pathStartsWithAny(pathname, RECRUITING_ROUTES);
  const isOrgRoute = pathStartsWithAny(pathname, ORG_ROUTES);
  const isAcademicsRoute = pathStartsWithAny(pathname, ACADEMICS_ROUTES);
  const isLegacyTeamRoute = pathStartsWithAny(pathname, LEGACY_TEAM_ROUTES);
  const requiredCapability = routeCapability(pathname);

  if (!isRecruitingRoute && !isOrgRoute && !isAcademicsRoute && !isLegacyTeamRoute && !requiredCapability) {
    return { authorized: true };
  }

  if (isLegacyTeamRoute) {
    return { authorized: false, redirectTo: COACH_HOME };
  }

  // Fetch coach profile. Player-only users should land on the player home
  // rather than bouncing through a coach-only destination.
  const { data: coach, error } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !coach) {
    return { authorized: false, redirectTo: PLAYER_HOME };
  }

  const coachId = String(coach.id);
  const staffRowsResult = await supabase
    .from('baseball_team_coach_staff')
    .select('*')
    .eq('coach_id', coachId);
  const staffRows = (staffRowsResult as unknown as { data?: Record<string, unknown>[] | null }).data ?? [];
  const staffRow =
    (activeTeamCookie ? staffRows.find((row) => row.team_id === activeTeamCookie) : undefined) ??
    staffRows[0] ??
    null;

  if (!staffRow?.team_id) {
    return { authorized: false, redirectTo: COACH_HOME };
  }

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('program_type, team_type')
    .eq('id', String(staffRow.team_id))
    .maybeSingle();
  // Effective program mode with a defense-in-depth fallback: program_type is the
  // controlling setting, but if it is ever null/absent (e.g. the demo team, created
  // with team_type:'college' but no program_type, or a pre-backfill/transient read
  // gap) we derive it from the always-present team_type enum. Otherwise a real
  // college coach is silently stripped of Pipeline/Discover/Watchlist/Compare and
  // bounced to the Command Center even though the sidebar advertises them.
  // nav-context.ts derives the SAME effective type, so nav visibility and route
  // gating share one source of truth. This resolves the mode; it does NOT weaken
  // the gate — a high_school program still fails the recruiting check below.
  const programType =
    normalizeProgramType(team?.program_type) ?? normalizeProgramType(team?.team_type);

  if (requiredCapability && !staffHasCapability(staffRow, requiredCapability)) {
    return {
      authorized: false,
      redirectTo: COACH_HOME,
    };
  }

  if (isRecruitingRoute && (!programType || !RECRUITING_PROGRAM_TYPES.has(programType))) {
    return {
      authorized: false,
      redirectTo: COACH_HOME
    };
  }

  if (isOrgRoute && (!programType || !ORG_PROGRAM_TYPES.has(programType))) {
    return {
      authorized: false,
      redirectTo: COACH_HOME,
    };
  }

  if (isAcademicsRoute) {
    // Academics is a capability-gated feature module (`can_view_academics`,
    // enforced above), not a program-type-only surface (fixes #508 — college
    // programs were hard-blocked here even though nav + program-type
    // defaults enable Academics for them). Every program type can turn the
    // module on/off via `baseball_program_settings.academics_module_enabled`.
    // College/JUCO default it ON, HS/showcase/academy/club default it OFF,
    // but a team can override that default either way, so read the team's
    // actual persisted setting instead of hard-coding a single allowed
    // program type. Falls back to the program-type default only when the
    // team has no settings row yet (matches getProgramSettings' lazy-create
    // behavior).
    const { data: settings } = await supabase
      .from('baseball_program_settings')
      .select('academics_module_enabled')
      .eq('team_id', String(staffRow.team_id))
      .maybeSingle();
    const raw = (settings as { academics_module_enabled?: unknown } | null)?.academics_module_enabled;
    const academicsEnabled =
      typeof raw === 'boolean'
        ? raw
        : getDefaultProgramSettings(programType ?? 'college').academics_module_enabled;

    if (!academicsEnabled) {
      return { authorized: false, redirectTo: COACH_HOME };
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
  const onAdminPath = isAdminPath(pathname);

  if (sport === 'baseball') {
    const legacyTarget = legacyBaseballRedirectTarget(pathname);
    if (legacyTarget) {
      return NextResponse.redirect(new URL(legacyTarget, request.url));
    }
  }

  if (isNativeUserAgent(request) && isMarketingRoute(pathname)) {
    return NextResponse.redirect(new URL('/golf/login', request.url));
  }

  // Public routes that don't need any session handling at all
  const isStaticPublicRoute = pathname === '/';

  // Allow truly static public routes without any session handling
  if (isStaticPublicRoute) {
    return NextResponse.next({
      request,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder. Check Vercel env.');
  }
  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Check Vercel env.');
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    url,
    anonKey,
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
  const activeTeamCookie = request.cookies.get(ACTIVE_BASEBALL_TEAM_COOKIE)?.value ?? null;

  // ── Helm Bridge Layer 1: /admin gate ──────────────────────────────────────
  // Explicit native block (App Store 4.2.2/3.1.1) + Nick-only allowlist.
  // This is the cheap first filter — NEVER the sole gate (Next middleware has
  // had bypass CVEs). Layer 2 is requireSuperAdmin() in every server entry
  // point; Layer 3 is deny-by-default RLS via is_super_admin().
  const adminGate = evaluateAdminGate({
    pathname,
    isNative: isNativeUserAgent(request),
    userId: user?.id ?? null,
    allowlistRaw: process.env.SUPER_ADMIN_USER_IDS,
  });
  if (adminGate === 'block-native' || adminGate === 'redirect-dashboard') {
    return NextResponse.redirect(new URL('/golf/dashboard', request.url));
  }
  if (adminGate === 'redirect-login') {
    const url = request.nextUrl.clone();
    url.pathname = '/golf/login';
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }
  // 'pass' and 'not-admin-path' fall through to the existing logic.

  // Dashboard routes require full authentication (not onboarding routes)
  const isDashboardRoute = pathname.startsWith('/baseball/dashboard') ||
                           pathname.startsWith('/golf/dashboard') ||
                           pathname.startsWith('/lifting/dashboard');
  const isProtectedRoute = isDashboardRoute;

  // ── Idle-timeout enforcement (5-minute re-auth) ───────────────────────────
  // A user who has been away longer than the idle window must sign in again,
  // rather than the session silently refreshing and auto-loading them back in.
  // The activity marker (sb_last_activity) is written by real user interaction
  // (client hook) and bootstrapped here on first sight; its long lifetime means
  // a genuine reopen after the window is always "present + stale". Absent/fresh
  // markers are treated as active so a brand-new login is never bounced.
  // Scoped to sport page routes (golf/baseball/lifting) AND /admin — the
  // single most powerful account in the app must not be exempt from the
  // platform's own idle-reauth policy (see #730). /api is still out.
  if (user && (sport || onAdminPath)) {
    const lastActivity = parseLastActivity(request.cookies.get(SESSION_IDLE_COOKIE)?.value);
    const now = Date.now();

    if (isSessionIdleExpired(lastActivity, now)) {
      try {
        // Local scope: clear cookies without a GoTrue round-trip — middleware
        // must stay fast and must not depend on auth-server reachability.
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* fall through — the explicit cookie clears below still sign them out */
      }

      const loginUrl = request.nextUrl.clone();
      // /admin has no login route of its own — it reuses /golf/login (same as
      // evaluateAdminGate's 'redirect-login' decision above) with returnTo
      // bringing them back to /admin after signing in again.
      loginUrl.pathname = sport ? `/${sport}/login` : '/golf/login';
      loginUrl.search = '';
      loginUrl.searchParams.set('message', 'session_expired');
      if (isProtectedRoute || onAdminPath) loginUrl.searchParams.set('returnTo', pathname);

      const res = NextResponse.redirect(loginUrl);
      // Propagate any cookie removals signOut wrote onto supabaseResponse...
      supabaseResponse.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
      // ...and belt-and-suspenders: explicitly expire every Supabase auth cookie
      // seen on EITHER the incoming request OR the post-getUser()/signOut response
      // (a same-tick token refresh can re-chunk the session into new cookie names
      // that appear only on the response), plus the activity marker — so a stale
      // session can't survive the redirect.
      const authCookieNames = new Set<string>();
      const collectAuthCookie = (name: string) => {
        if (name.startsWith('sb-') && name.includes('-auth-token')) authCookieNames.add(name);
      };
      request.cookies.getAll().forEach((cookie) => collectAuthCookie(cookie.name));
      supabaseResponse.cookies.getAll().forEach((cookie) => collectAuthCookie(cookie.name));
      authCookieNames.forEach((name) => res.cookies.delete(name));
      res.cookies.delete(SESSION_IDLE_COOKIE);
      return res;
    }

    // Bootstrap the marker on first sight (fresh login). Do NOT refresh it when
    // present — activity is tracked by real interaction (client), not by every
    // server request, or background fetches would keep a session alive forever.
    if (lastActivity === null) {
      supabaseResponse.cookies.set(SESSION_IDLE_COOKIE, String(now), {
        path: '/',
        maxAge: SESSION_IDLE_COOKIE_MAX_AGE_S,
        sameSite: 'lax',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
      });
    }
  }

  // Redirect to login if accessing protected route without auth
  // Always redirect unauthenticated users - client-side will handle auth state
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    // Redirect to the sport-specific login page
    if (sport === 'lifting') {
      url.pathname = '/lifting/login';
    } else {
      url.pathname = sport ? `/${sport}/login` : '/baseball/login';
    }
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }

  // Check role-based authorization for authenticated users
  // PERF: Only run for baseball routes — golf/lifting handle auth in their own layouts.
  // This avoids an unnecessary baseball_coaches DB query on every golf/lifting request.
  if (user && isDashboardRoute && sport === 'baseball') {
    const authResult = await checkRouteAuthorization(
      supabase as unknown as SupabaseClient,
      user,
      pathname,
      activeTeamCookie,
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
