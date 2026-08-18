/**
 * Which recovery actions a 404 should offer, and which one to promote.
 *
 * This is the whole platform's dead-end page — `/golf/**`, `/baseball/**` and
 * every marketing route funnel into one `not-found.tsx`. It used to hardcode
 * "Baseball Dashboard" as the single filled primary button, so a golf coach
 * who mistyped a URL inside `/golf/dashboard/...` was pointed at a product
 * they do not use, with their own dashboard demoted to an outline beside it.
 * Observed in production 2026-08-17 on
 * `/golf/dashboard/players/<id>/insight`.
 *
 * Kept as a pure function rather than inlined into the component so the
 * routing rule is testable without rendering, and so the "promote nothing when
 * unsure" case below cannot quietly regress into a guess.
 */

export interface NotFoundDestination {
  href: string;
  label: string;
  /** Rendered as the filled button. At most one, and only when we actually know. */
  primary: boolean;
}

const GOLF = { href: '/golf/dashboard', label: 'Golf Dashboard' } as const;
const BASEBALL = { href: '/baseball/dashboard', label: 'Baseball Dashboard' } as const;
const HOME = { href: '/', label: 'Go to Home' } as const;

/**
 * `pathname` is the route the visitor failed to reach. A leading `/golf` or
 * `/baseball` segment is the only signal trusted — a sport name appearing
 * later in a path (`/blog/why-we-built-baseball`) is prose, not a product
 * route, and promoting off it would reintroduce the bug in a subtler form.
 *
 * When there is no signal, NOTHING is promoted. Both sports stay on offer and
 * the visitor chooses. Guessing is what produced the original defect.
 */
export function destinationsFor(pathname: string | null | undefined): NotFoundDestination[] {
  const sport =
    pathname?.startsWith('/golf/') || pathname === '/golf'
      ? 'golf'
      : pathname?.startsWith('/baseball/') || pathname === '/baseball'
        ? 'baseball'
        : null;

  // The matching sport leads, so the promoted action is also the first one a
  // keyboard or screen-reader user reaches.
  const sports: NotFoundDestination[] =
    sport === 'golf'
      ? [{ ...GOLF, primary: true }, { ...BASEBALL, primary: false }]
      : sport === 'baseball'
        ? [{ ...BASEBALL, primary: true }, { ...GOLF, primary: false }]
        : [{ ...GOLF, primary: false }, { ...BASEBALL, primary: false }];

  return [...sports, { ...HOME, primary: false }];
}
