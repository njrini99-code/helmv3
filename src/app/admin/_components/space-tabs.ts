/**
 * The deeper views each space opens from its own tab row (Product, Ship, Desk), and which admin pages therefore
 * leave the admin menu.
 *
 * The owner asked for the old routes out of the menu (2026-11-26). The pages stay: each is the detailed view a space
 * links to. A page leaves the menu (the rail and the phone's More sheet) only when a space reaches it in one tap, so
 * nothing is stranded on a phone, which has no ⌘K and no shortcut keys. ⌘K, breadcrumbs and shortcut keys still list
 * every page (ADMIN_NAV is unchanged).
 */

export type SpaceTab = { label: string; href: string; note: string };

export const PRODUCT_TABS: readonly SpaceTab[] = [
  { label: 'Utilization', href: '/admin/utilization', note: 'adoption by day and person' },
  { label: 'Health', href: '/admin/health', note: 'feature health, budgets, heartbeats' },
  { label: 'Golf (legacy)', href: '/admin/golf', note: 'GolfHelm production signals' },
  { label: 'Baseball', href: '/admin/baseball', note: 'BaseballHelm signals' },
  { label: 'Lift Lab', href: '/admin/lifting', note: 'strength program activity' },
];

export const SHIP_TABS: readonly SpaceTab[] = [
  { label: 'Deploys & Infra', href: '/admin/deploys', note: 'release ledger, web insight' },
  { label: 'Releases', href: '/admin/releases', note: 'feature flags, kill switches' },
  { label: 'Database', href: '/admin/database', note: 'posture, performance, schema' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', note: 'crons, guards, checks' },
];

export const DESK_TABS: readonly SpaceTab[] = [
  { label: 'Engineering OS', href: '/admin/engineering', note: 'decision inbox, gates' },
  { label: 'Work log', href: '/admin/work', note: 'PR timeline, change to proof' },
  { label: 'Ben + Leah', href: '/admin/ben-leah', note: 'tester reports' },
  { label: 'CRM', href: '/golf/admin/crm', note: 'coach pipeline' },
];

/** Today's "All activity" link (spaces/today/page.tsx) is the one-tap way to the event stream. */
export const TODAY_ACTIVITY_HREF = '/admin/activity';

/**
 * Old front doors a space replaced. They leave the menu but keep their page (⌘K and their shortcut key still open
 * them), because each still holds a view no space has yet. Deleting one is the owner's call.
 */
export const SUPERSEDED_IN_MENU: ReadonlyArray<{ href: string; by: string; keeps: string }> = [
  { href: '/admin/pulse', by: '/admin/spaces/today', keeps: 'the command deck and the change timeline' },
  { href: '/admin/teams', by: '/admin/spaces/people', keeps: 'the cross-sport activity and error EKG' },
];

/** Admin pages the menu does not list: those a space opens in one tap, and the old front doors a space replaced. */
export const MENU_HIDDEN_HREFS: ReadonlySet<string> = new Set([
  ...[...PRODUCT_TABS, ...SHIP_TABS, ...DESK_TABS].map((t) => t.href),
  TODAY_ACTIVITY_HREF,
  ...SUPERSEDED_IN_MENU.map((s) => s.href),
]);

const OWNER: ReadonlyArray<readonly [string, readonly SpaceTab[] | readonly { href: string }[]]> = [
  ['/admin/spaces/product', PRODUCT_TABS],
  ['/admin/spaces/ship', SHIP_TABS],
  ['/admin/spaces/desk', DESK_TABS],
  ['/admin/spaces/today', [{ href: TODAY_ACTIVITY_HREF }]],
];

/**
 * The space a menu-less page belongs to ("/admin/database/…" → Ship), so the rail and the bottom bar light that space
 * while you are on one of its deeper views. Null for any other path.
 */
export function owningSpace(pathname: string): string | null {
  for (const [space, tabs] of OWNER) {
    if (tabs.some((t) => t.href.startsWith('/admin/') && (pathname === t.href || pathname.startsWith(`${t.href}/`)))) return space;
  }
  return null;
}
