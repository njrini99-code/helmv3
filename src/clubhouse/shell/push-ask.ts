/**
 * When the app may ask for push (docs/clubhouse/phone/push-opt-in.md, release blocker 12): a calm moment, never the
 * first paint. The rules are here, plain, so they can be read and tested apart from the sheet (PushAsk.tsx).
 */

/** How long one page must hold before the ask may show: past the first paint and the page's own reads. */
export const PUSH_ASK_SETTLE_MS = 4000;

/** Pages the ask never interrupts: a round being entered, onboarding, and Settings, which has its own row. */
const QUIET_ROUTES = [/^\/golf\/dashboard\/rounds\/(new|continue)(\/|$)/, /^\/golf\/dashboard\/settings(\/|$)/, /^\/golf\/onboard/];

export function pushAskRouteOk(pathname: string): boolean {
  return !QUIET_ROUTES.some((re) => re.test(pathname));
}

/** Nothing else has the person: the app in front, no sheet or dialog open, the section strip closed, no field focused. */
export function pushAskCalm(doc: Document): boolean {
  if (doc.visibilityState !== 'visible') return false;
  if (doc.querySelector('dialog[open]')) return false;
  const overlay = [...doc.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((el) => !el.closest('[hidden], [aria-hidden="true"]'));
  if (overlay) return false;
  if (doc.querySelector('[data-strip="open"]')) return false;
  const active = doc.activeElement as HTMLElement | null;
  if (active && (active.matches('input, textarea, select') || active.isContentEditable)) return false;
  return true;
}

/** At most once a launch: the stored answer (shared with Fairway's ask) keeps it from ever showing again after one. */
let shownThisLaunch = false;
export const pushAskShown = (): boolean => shownThisLaunch;
export function markPushAskShown(): void {
  shownThisLaunch = true;
}
export function resetPushAskForTest(): void {
  shownThisLaunch = false;
}
