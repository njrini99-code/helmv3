/**
 * Which recovery actions a 404 should offer, and which one to promote.
 *
 * This is the whole platform's dead-end page — `/golf/**`, `/baseball/**`,
 * `/lifting/**` and every marketing route funnel into one `not-found.tsx`. It
 * used to hardcode "Baseball Dashboard" as the single filled primary button, so
 * a golf coach who mistyped a URL inside `/golf/dashboard/...` was pointed at a
 * product they do not use, with their own dashboard demoted to an outline
 * beside it. Observed in production 2026-08-17 on
 * `/golf/dashboard/players/<id>/insight`.
 *
 * One primary action, always (GAP-M-02, 15 Nov 2026): the product's own home
 * when the path names a product, the site's home when it names none. A sport is
 * never guessed — guessing is what produced the original defect — so an unknown
 * path promotes Home, and every product stays on offer as a quiet link.
 *
 * Kept as a pure function rather than inlined into the component so the
 * routing rule is testable without rendering.
 */

export interface NotFoundDestination {
  href: string;
  /** The destination's name, as a quiet link shows it. */
  label: string;
  /** The words on the button when this is the one primary action. */
  action: string;
  /** The filled button. Exactly one destination has it. */
  primary: boolean;
}

type Place = Omit<NotFoundDestination, 'primary'>;

const HOME: Place = { href: '/', label: 'Home', action: 'Go to the home page' };
const GOLF: Place = { href: '/golf/dashboard', label: 'GolfHelm', action: 'Go to GolfHelm' };
const BASEBALL: Place = { href: '/baseball/dashboard', label: 'BaseballHelm', action: 'Go to BaseballHelm' };
const LIFTING: Place = { href: '/lifting/dashboard', label: 'Lift Lab', action: 'Go to Lift Lab' };

/** The quiet links' order, whichever one is promoted. */
const ALL: readonly Place[] = [HOME, GOLF, BASEBALL, LIFTING];

/** The product a path is inside: only a leading segment counts (`/blog/why-we-built-baseball` is prose, not a product). */
function productFor(pathname: string | null | undefined): Place | null {
  const first = pathname?.split('/')[1];
  if (first === 'golf') return GOLF;
  if (first === 'baseball') return BASEBALL;
  if (first === 'lifting') return LIFTING;
  return null;
}

/**
 * `pathname` is the route the visitor failed to reach. The promoted
 * destination comes first, so it is also the first one a keyboard or
 * screen-reader user reaches.
 */
export function destinationsFor(pathname: string | null | undefined): NotFoundDestination[] {
  const lead = productFor(pathname) ?? HOME;
  return [{ ...lead, primary: true }, ...ALL.filter((p) => p !== lead).map((p) => ({ ...p, primary: false }))];
}
