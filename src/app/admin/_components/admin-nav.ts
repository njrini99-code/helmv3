type AdminHref =
  | '/admin'
  | '/admin/clubhouse'
  | '/admin/clubhouse/controls'
  | '/admin/clubhouse/actions'
  | '/admin/clubhouse/codes'
  | '/admin/clubhouse/readiness'
  | '/admin/activity'
  | '/admin/errors'
  | '/admin/traces'
  | '/admin/engineering'
  | '/admin/database'
  | '/admin/auth'
  | '/admin/golf'
  | '/admin/baseball'
  | '/admin/lifting'
  | '/admin/ben-leah'
  | '/admin/work'
  | '/admin/users'
  | '/admin/utilization'
  | '/admin/jobs'
  | '/admin/deploys'
  | '/admin/releases'
  | '/admin/health'
  | '/admin/teams';

export interface AdminNavEntry {
  label: string;
  href: AdminHref;
  key: string;
  // 'More' — an OWNER-DECIDED deprioritized group: still fully wired (URL,
  // shortcut, ⌘K, mobile More sheet), just rendered under its own heading at
  // the end of the rail/⌘K instead of alongside the primary tabs. Derived
  // the same way every other section is (NAV_SECTION_ORDER in AdminShell.tsx)
  // — never a second hand-listed rail.
  section: 'Clubhouse' | 'Triage' | 'Customers' | 'Platform' | 'More';
  description: string;
  meta?: string;
}

/** The primary Bridge tabs. Order is the rail order; `key` is the keyboard map.
 *
 * KEYS NEVER MOVE. '1'-'9' and '0' keep the routes they had when the numeric
 * map was fixed, letters are Shift+letter, and a letter is never reused while
 * `RETIRED_SHORTCUTS` (src/lib/admin/retired-routes.ts) still sends it to the
 * view that absorbed a retired tab. That is why the Clubhouse screens are
 * H, I, J, C and M rather than the plan's P, O, A, C and G
 * (docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md
 * §7.1): P, O, A and G are retired shortcuts operators still use.
 *
 * Grouping (plan §7.1, owner decision D3, 2026-11-24): Clubhouse leads; Golf
 * (legacy), Baseball, Lift Lab, Engineering OS and Ben + Leah sit under More.
 * URLs and keys are unchanged by the regrouping. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  // CLUBHOUSE — "is Clubhouse doing what its contract says" (plan §7.1).
  // '/admin' stays "Overview" until B01 Pulse replaces it (PR 3): the bottom
  // bar, the tab title and this rail must keep naming one place one way.
  { label: 'Overview', href: '/admin', key: '1', section: 'Clubhouse', description: 'Command posture, triage, deploys; Clubhouse Pulse lands here', meta: 'live' },
  { label: 'Pages', href: '/admin/clubhouse', key: 'H', section: 'Clubhouse', description: 'The 17 pages against their contracts', meta: 'B02' },
  { label: 'Controls', href: '/admin/clubhouse/controls', key: 'I', section: 'Clubhouse', description: 'Every button, labelled, and what it runs', meta: 'B03' },
  { label: 'Actions', href: '/admin/clubhouse/actions', key: 'J', section: 'Clubhouse', description: 'Each press: handler, tables and outcomes', meta: 'B04' },
  { label: 'Codes', href: '/admin/clubhouse/codes', key: 'C', section: 'Clubhouse', description: 'Every Bridge ID and CH- code, one dossier each', meta: 'B05' },
  { label: 'Readiness', href: '/admin/clubhouse/readiness', key: 'M', section: 'Clubhouse', description: 'How finished Clubhouse is, by its own gates', meta: 'B12' },

  // TRIAGE — "what is broken right now"
  // "Incidents", not "Errors". The list now carries app errors, Sentry
  // issues, Supabase faults, Vercel faults, reliability-only signals and
  // regressions folded into ONE incident each — "Errors" had become too
  // narrow a word for what the tab holds. The ROUTE is deliberately unchanged:
  // renaming it would break every stored deep link, every rca_analysis row's
  // /admin/errors/<fp> reference, and the repair contract's PR-body join,
  // and buys nothing an operator can see.
  { label: 'Incidents', href: '/admin/errors', key: '3', section: 'Triage', description: 'One incident per cause, with every source that saw it', meta: 'trace' },
  // Three views: the feature dot grid, ?view=budgets (error budgets, golden
  // paths, silence detection, trace funnels — was the SLO Center tab, and
  // every one of those four reads is a read of feature health) and
  // ?view=heartbeats (the Heartbeat Matrix and Invariant Lattice).
  { label: 'Health', href: '/admin/health', key: '0', section: 'Triage', description: 'Feature health, budgets, heartbeats', meta: 'map' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '8', section: 'Triage', description: 'Crons, guards, integrity checks' },
  // Database/Postgres-layer signal, distinct from the Incidents `sources`
  // view: that correlates APPLICATION-level signals across three sources
  // every 3 hours; this tab is the DATABASE's own state — connections, deduped
  // Supabase/PostgREST failures, query-performance deltas — read from the
  // zero-cost collectors every 5-15 minutes.
  // Three views over what was a nineteen-section scroll: posture (is it
  // healthy), performance (what is slow), schema (is it safe). A ?incident=
  // deep link renders above the rail under every one of them.
  { label: 'Database', href: '/admin/database', key: 'X', section: 'Triage', description: 'Postgres posture, performance, schema', meta: '5m' },
  // The Flight Recorder tree. Distinct from the Golf Tracer at /admin/golf/tracer:
  // that answers "which rounds are stuck", this answers "walk me through one
  // execution and show me where it diverged".
  { label: 'Flight Recorder', href: '/admin/traces', key: 'F', section: 'Triage', description: 'One round mutation traced end to end', meta: 'trace' },
  // Was reachable ONLY from a text-xs back-arrow three levels deep, despite
  // being the one cross-sport board built to answer "who needs attention" —
  // 30-day activity/error EKG with four triage sorts.
  { label: 'Teams pulse', href: '/admin/teams', key: 'T', section: 'Triage', description: 'Cross-sport team activity and error EKG' },

  // CUSTOMERS — "who is this, and how are they doing"
  { label: 'Users & Teams', href: '/admin/users', key: '7', section: 'Customers', description: 'Accounts, teams, engagement' },
  { label: 'Activity', href: '/admin/activity', key: '2', section: 'Customers', description: 'User and product event stream' },
  { label: 'Utilization', href: '/admin/utilization', key: 'U', section: 'Customers', description: 'Feature usage and adoption' },

  // PLATFORM
  { label: 'Deploys & Infra', href: '/admin/deploys', key: '9', section: 'Platform', description: 'Vercel releases and web insight' },
  // The flag/kill-switch governance board — feature-flags.yml rendered as a
  // registry, not the deploy-risk/rollback surface `/admin/deploys` owns.
  { label: 'Releases', href: '/admin/releases', key: 'K', section: 'Platform', description: 'Feature flags and kill switches', meta: 'flags' },
  { label: 'Auth & Sign-ins', href: '/admin/auth', key: '4', section: 'Platform', description: 'Access, sessions, auth failures' },
  // Two views: the PR timeline (problem/fix narrative from
  // github-pr-timeline.ts) and ?view=proof, the change-to-proof join over the
  // SAME entries (repair verdict, shipped release, post-deploy delta). They
  // were two tabs until the 30→19 consolidation; one feed, two framings.
  { label: 'Work log', href: '/admin/work', key: 'W', section: 'Platform', description: 'PR timeline and change-to-proof', meta: 'prs' },

  // MORE — owner-deprioritized (D3). The per-sport tabs moved here when the
  // rail started leading with Clubhouse; Golf's incident panel already shows
  // Clubhouse only, hence "legacy".
  { label: 'Golf (legacy)', href: '/admin/golf', key: '5', section: 'More', description: 'GolfHelm production signals' },
  { label: 'Baseball', href: '/admin/baseball', key: '6', section: 'More', description: 'BaseballHelm production signals' },
  { label: 'Lift Lab', href: '/admin/lifting', key: 'L', section: 'More', description: 'Cross-sport strength program activity' },
  // OWNER DECISION (bridge-tab-audit-p0p1): agent/engineering-process tooling,
  // not a daily-operator surface. Its URL and 'Z' shortcut are unchanged.
  { label: 'Engineering OS', href: '/admin/engineering', key: 'Z', section: 'More', description: 'Decision Inbox, Agent Flight Recorder, gates, blast radius', meta: 'os' },
  { label: 'Ben + Leah', href: '/admin/ben-leah', key: 'B', section: 'More', description: 'Log tester-reported bugs on their behalf', meta: 'issues' },
] as const;

/**
 * Owner decision D5: the self-heal views sit under More, and their jobs keep
 * running. They are VIEWS of other tabs (a `?view=` or a section of a page),
 * not routes of their own, so they cannot be ADMIN_NAV entries (every entry is
 * a real page: nav-covers-every-route.test.ts). AdminShell appends them to the
 * More group of the rail and ⌘K; they never light up as the current tab,
 * because the tab that owns them already does.
 */
export interface AdminMoreView {
  label: string;
  href: string;
  description: string;
  /** A retired shortcut that already lands here, shown as the hint. */
  key?: string;
}

export const ADMIN_MORE_VIEWS: readonly AdminMoreView[] = [
  { label: 'Self-heal loop', href: '/admin/errors?view=loop', key: 'S', description: 'Collect, diagnose, repair, close: has each stage produced its output' },
  { label: 'Self-healing jobs', href: '/admin/jobs#self-heal', description: 'The loop’s stages as jobs, and whether each has run' },
] as const;

/**
 * The nav entry that owns `pathname`: the LONGEST matching href, on a segment
 * boundary. `/admin/clubhouse/controls/CTL-1` belongs to Controls, not to
 * Pages (`/admin/clubhouse`), which a first-match `startsWith` picks; and
 * `/admin/users-x` is not under `/admin/users`. `/admin` owns only itself.
 * The rail highlight, the bottom bar and the breadcrumbs all read this, so
 * they cannot disagree.
 */
export function navEntryForPath(pathname: string): AdminNavEntry | null {
  let best: AdminNavEntry | null = null;
  for (const entry of ADMIN_NAV) {
    const hit =
      entry.href === '/admin'
        ? pathname === '/admin'
        : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    if (hit && (!best || entry.href.length > best.href.length)) best = entry;
  }
  return best;
}

export function isNavEntryActive(href: string, pathname: string): boolean {
  return navEntryForPath(pathname)?.href === href;
}

export function hrefForShortcut(key: string): string | null {
  return ADMIN_NAV.find((e) => e.key === key)?.href ?? null;
}

/**
 * Single, UNMODIFIED (no Shift) keys that AdminShell's global keydown
 * handler intercepts for something other than tab navigation — currently
 * just plain 'r' for "refresh now" (the same action the Refresh button
 * fires). Every ADMIN_NAV letter shortcut is deliberately the Shift+letter
 * (uppercase `e.key`) form specifically so it can never collide with one of
 * these; digit shortcuts need no Shift and have no local reservation to
 * collide with. `admin-nav.test.ts` asserts no ADMIN_NAV key falls in this
 * set, so a future addition here — or a future lowercase ADMIN_NAV key — is
 * caught immediately instead of silently making a tab unreachable, which is
 * exactly what happened to Reliability's 'R' shortcut when AdminShell used
 * to treat plain 'r' and Shift+'R' as the same refresh trigger (fixed
 * alongside this constant, Bridge Premium Phase 6).
 */
export const RESERVED_LOCAL_SHORTCUTS: ReadonlySet<string> = new Set(['r']);

/**
 * M1 (bridge-chrome, docs/MOBILE_DOCTRINE.md rule 10): Bridge's mobile
 * bottom-tab daily loop — Overview / Errors / Health / Users (Synthesis
 * Decision 6). A stable module-level array (never a fresh literal at the
 * call site) so it can be passed straight through as `AppShell`'s
 * `bottomNavHrefs` and `selectOverflow`'s `excludeHrefs` without defeating
 * any memoization downstream.
 */
export const BRIDGE_BOTTOM_NAV_HREFS = [
  '/admin',
  '/admin/errors',
  '/admin/health',
  '/admin/users',
] as const satisfies readonly AdminHref[];

/**
 * Short bottom-tab labels — deliberately distinct from `ADMIN_NAV`'s longer
 * rail labels (e.g. "Users & Teams" would truncate awkwardly in a ~64px-wide
 * tab column; the rail keeps the fuller label).
 */
export const BRIDGE_BOTTOM_NAV_LABELS: Record<(typeof BRIDGE_BOTTOM_NAV_HREFS)[number], string> = {
  '/admin': 'Overview',
  // Matches the rail label. The bottom tab is the same destination, and two
  // names for one place is how muscle memory gets taught wrong.
  '/admin/errors': 'Incidents',
  '/admin/health': 'Health',
  '/admin/users': 'Users',
};
