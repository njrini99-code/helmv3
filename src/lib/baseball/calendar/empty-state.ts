import { isRecruitingEnabled } from '@/lib/baseball/product-modules';

/**
 * Which empty state the Calendar shows when no team resolves.
 *
 * THE PROBLEM THIS SOLVES. The calendar page picked its empty state purely on
 * coach type: a college coach with no team got `recruitingEmpty`, everyone else
 * got `noTeamEmpty`. That was correct when recruiting shipped — a college coach
 * is a pure recruiter, so "no team" is the expected steady state for them, and
 * the recruiting narrative is the useful one.
 *
 * Under the recruiting sunset it is wrong, and wrong on a demo-path screen. A
 * college coach who has not set up a team yet — a very ordinary first-login
 * state — opens Calendar and reads "Your recruiting calendar is empty / Camp
 * visits and official visit windows will appear here", under a **Browse
 * prospects** button pointing at `/baseball/dashboard/discover`, which the
 * sunset now blocks. So the one module the product is currently not selling
 * gets the first word, and its call to action is a dead end.
 *
 * THE FIX, AND WHY IT IS HERE. Applied at READ time, exactly like
 * `resolveDifferentiator` in bottom-nav.ts and for the same reason: the
 * recruiting narrative is still the right answer the day the module returns, so
 * the page's intent is left intact and the gate is applied where the decision
 * is consumed. Flipping `PRODUCT_MODULES.recruiting.enabled` restores the old
 * behaviour with no edit here.
 *
 * The fallback is the state that already exists for every other no-team caller,
 * so nothing new had to be designed and nothing can render blank.
 */
export interface CalendarEmptyState {
  /** Recruiting-framed narrative + "Browse prospects" CTA. */
  recruitingEmpty: boolean;
  /** Generic "no team assigned" state. */
  noTeamEmpty: boolean;
}

export function resolveCalendarEmptyState(isCollegeCoach: boolean): CalendarEmptyState {
  const recruitingEmpty = isCollegeCoach && isRecruitingEnabled();
  // Deliberately derived rather than independently computed: the two are
  // documented as mutually exclusive in CalendarFairway's props, and computing
  // them separately is how they would drift into both-false (a blank shell) or
  // both-true (first branch silently wins).
  return { recruitingEmpty, noTeamEmpty: !recruitingEmpty };
}
