/**
 * The single authority on "where does a signed-in user belong?"
 *
 * WHY THIS EXISTS
 *
 * That question used to be answered independently in five places — `loginAction`,
 * `login/page.tsx`, `welcome/page.tsx`, `NativeRedirect`, and the dashboard
 * layout — each with its own copy of the rules and its own idea of the default.
 * `resolveAdminPostLoginPath` centralised one ternary out of that mess; this
 * centralises the rest.
 *
 * More importantly, four of those five answered the question in the BROWSER,
 * after the page had already painted. That is the whole reason signing in feels
 * fidgety: an authenticated user opening `/golf/login` got the full login screen
 * — scene, brand lockup, 0.6s entrance animation, form card — and only then did
 * an async session check resolve and yank them to the dashboard. The screen was
 * never wrong; it was just asked to render before anyone knew who was looking.
 *
 * The fix is to answer it once, on the server, before any HTML ships. This
 * module holds the rules so the middleware and any remaining client caller can
 * never disagree.
 */
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';

export type HelmSport = 'baseball' | 'golf' | 'lifting';

/**
 * Where a signed-in user lands when they have no explicit destination.
 *
 * Deliberately the SPORT ROOT, not a role-specific page. Resolving coach vs
 * player vs admin needs database reads, and doing them in middleware would put
 * two queries in front of every single request to an auth route. The dashboard
 * layouts already resolve role and onboarding state and forward accordingly, so
 * landing on the root is both correct and free — one redirect instead of a
 * query-then-redirect.
 */
export const SPORT_HOME: Record<HelmSport, string> = {
  golf: '/golf/dashboard',
  baseball: '/baseball/dashboard/command-center',
  lifting: '/lifting/dashboard',
};

/**
 * Auth-route segments an ALREADY-AUTHENTICATED user should be redirected away
 * from.
 *
 * This is deliberately a two-item allowlist rather than "every auth route",
 * because most of the (auth) group legitimately requires a session:
 *
 *   login            BOUNCE — nothing for a signed-in user to do here.
 *   signup           BOUNCE — same.
 *
 *   reset-password   NEVER. The recovery link signs the user in; that IS the
 *                    mechanism. Bouncing it breaks password reset outright.
 *   callback         NEVER. OAuth/email confirmation must be allowed to run.
 *   complete-signup  NEVER. Requires a session by design.
 *   welcome          NEVER. It is the intentional post-sign-in splash — the one
 *                    place an authenticated user is supposed to be.
 *   forgot-password  NEVER, conservatively. A signed-in user asking for a reset
 *                    email is odd but harmless, and bouncing it is a behaviour
 *                    change nobody asked for.
 *   demo             NEVER. The demo gate has its own entry semantics.
 */
export const BOUNCE_WHEN_AUTHED: ReadonlySet<string> = new Set(['login', 'signup']);

/** The `/{sport}/{section}` segment, or undefined for a non-sport path. */
function sectionOf(pathname: string): string | undefined {
  return pathname.split('/').filter(Boolean)[1];
}

/**
 * True when an authenticated user is sitting on a page that exists only to get
 * them authenticated.
 */
export function isBounceWhenAuthedRoute(pathname: string, sport: HelmSport | null): boolean {
  if (!sport) return false;
  const section = sectionOf(pathname);
  return section !== undefined && BOUNCE_WHEN_AUTHED.has(section);
}

/**
 * Resolve where to send a signed-in user who landed on a sign-in page.
 *
 * `returnTo` wins when it is a safe internal path — that is what carries an
 * invite or a deep link through the sign-in round trip. Anything else (absolute
 * URL, protocol-relative, traversal) is discarded rather than sanitised: this
 * value reaches `NextResponse.redirect`, so a permissive reading here is an
 * open-redirect.
 */
export function resolvePostAuthDestination(args: {
  sport: HelmSport | null;
  returnTo?: string | null;
}): string {
  const { sport, returnTo } = args;
  if (isSafeInternalPath(returnTo)) return returnTo;
  return SPORT_HOME[sport ?? 'golf'];
}
