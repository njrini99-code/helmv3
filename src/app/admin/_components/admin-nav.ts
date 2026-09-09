type AdminHref =
  | '/admin'
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
  | '/admin/teams'
  | '/admin/billing';

export interface AdminNavEntry {
  label: string;
  href: AdminHref;
  key: string;
  section: 'Triage' | 'Customers' | 'Apps' | 'Platform' | 'Revenue';
  description: string;
  meta?: string;
}

/** The primary Bridge tabs. Order is the keyboard map: '1'-'9' for the
 *  original first nine tabs, '0' for Health, 'B' for the Ben + Leah intake
 *  desk, and single letters for tabs added after that numeric map was
 *  fixed (Lift Lab, Utilization) — never renumbering '1'-'9' avoids
 *  reassigning a shortcut an admin already has muscle memory for. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  // TRIAGE — "what is broken right now"
  { label: 'Overview', href: '/admin', key: '1', section: 'Triage', description: 'Command posture, triage, deploys', meta: 'live' },
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
  { label: 'Database', href: '/admin/database', key: 'X', section: 'Triage', description: 'Postgres health, deduped DB errors, query deltas', meta: '5m' },
  // Was reachable ONLY from a text-xs back-arrow three levels deep, despite
  // being the one cross-sport board built to answer "who needs attention" —
  // 30-day activity/error EKG with four triage sorts.
  // The Flight Recorder tree. Distinct from the Golf Tracer at /admin/golf/tracer:
  // that answers "which rounds are stuck", this answers "walk me through one
  // execution and show me where it diverged".
  { label: 'Flight Recorder', href: '/admin/traces', key: 'F', section: 'Triage', description: 'One round mutation traced end to end', meta: 'trace' },
  { label: 'Teams pulse', href: '/admin/teams', key: 'T', section: 'Triage', description: 'Cross-sport team activity and error EKG' },

  // CUSTOMERS — "who is this, and how are they doing"
  { label: 'Users & Teams', href: '/admin/users', key: '7', section: 'Customers', description: 'Accounts, teams, engagement' },
  { label: 'Activity', href: '/admin/activity', key: '2', section: 'Customers', description: 'User and product event stream' },
  { label: 'Utilization', href: '/admin/utilization', key: 'U', section: 'Customers', description: 'Feature usage and adoption' },

  // APPS — per-sport production signals
  { label: 'Golf', href: '/admin/golf', key: '5', section: 'Apps', description: 'GolfHelm production signals' },
  { label: 'Baseball', href: '/admin/baseball', key: '6', section: 'Apps', description: 'BaseballHelm production signals' },
  { label: 'Lift Lab', href: '/admin/lifting', key: 'L', section: 'Apps', description: 'Cross-sport strength program activity' },

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
  { label: 'Engineering OS', href: '/admin/engineering', key: 'Z', section: 'Platform', description: 'Decision Inbox, Agent Flight Recorder, gates, blast radius', meta: 'os' },

  // REVENUE — zero inbound links repo-wide before this entry.
  { label: 'Billing', href: '/admin/billing', key: 'V', section: 'Revenue', description: 'Create invoices' },

  // INTAKE
  { label: 'Ben + Leah', href: '/admin/ben-leah', key: 'B', section: 'Platform', description: 'Log tester-reported bugs on their behalf', meta: 'issues' },
] as const;

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
