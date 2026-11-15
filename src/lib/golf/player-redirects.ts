/**
 * Coach-only GolfHelm addresses, and where a player who opens one belongs (PMAC-11).
 *
 * Each of these used to answer a player from its layout (`redirectToClubhouse`, `coachTeam()` in
 * `src/clubhouse/routes/practice.tsx`). Under the dashboard's loading boundary the response has already started
 * streaming by then, so the player got a 200 with the coach page's title and a client-side bounce: a stale bookmark
 * flashed the wrong page. The proxy answers these with a 307 before anything renders (`src/lib/supabase/middleware.ts`).
 * The layouts keep their own redirects as the backstop.
 *
 * Pure, so the proxy, the layouts and tests share one list.
 */

const BASE = '/golf/dashboard';

/** Exact addresses (any trailing slash ignored) and where a player goes instead. */
const EXACT: ReadonlyMap<string, string> = new Map([
  [`${BASE}/whats-new`, BASE],
  [`${BASE}/live`, BASE],
  [`${BASE}/team`, `${BASE}/settings?section=golf`],
  [`${BASE}/coachhelm/chat`, `${BASE}/coachhelm`],
]);

/** Practice's coach-only pages: the drill library, a drill, groups, templates, the plan format and a print view. */
const PRACTICE_COACH = new RegExp(`^${BASE}/practice/(?:drills|groups|templates|format|print)(?:/[^/]+)?$`);
/** The plan builder: a player gets the plan itself. */
const PLAN_EDIT = new RegExp(`^${BASE}/practice/plan/([^/]+)/edit$`);

/** Where a player who opened `pathname` belongs, or null when the address is theirs too. */
export function golfPlayerRedirect(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const exact = EXACT.get(path);
  if (exact) return exact;
  if (PRACTICE_COACH.test(path)) return `${BASE}/practice`;
  const edit = PLAN_EDIT.exec(path);
  if (edit) return `${BASE}/practice/plan/${edit[1]}`;
  return null;
}

/**
 * Whether these profiles make the user a player and nothing else. A user with a coach row is left to the layouts,
 * which apply the dashboard's full role rule (`golf-dashboard-role.ts`); this only has to be right where it acts.
 */
export function isGolfPlayerOnly(profiles: { coach: unknown; player: unknown }): boolean {
  return !profiles.coach && Boolean(profiles.player);
}
