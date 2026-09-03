type AdminHref =
  | '/admin'
  | '/admin/activity'
  | '/admin/errors'
  | '/admin/traces'
  | '/admin/engineering'
  | '/admin/work-log'
  | '/admin/qualifiers'
  | '/admin/reliability'
  | '/admin/self-heal'
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
  | '/admin/billing'
  | '/admin/lenses/golf'
  | '/admin/lenses/baseball'
  | '/admin/lenses/lifting'
  | '/admin/lenses/teams'
  | '/admin/lenses/users';

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
  { label: 'Health', href: '/admin/health', key: '0', section: 'Triage', description: 'Feature health across every app', meta: 'map' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '8', section: 'Triage', description: 'Crons, guards, integrity checks' },
  // The 3-hourly collector's correlated view. Distinct from Errors: that tab
  // shows each source's incidents, this one shows what MORE THAN ONE source
  // agrees on, plus which sources were readable at all.
  { label: 'Reliability', href: '/admin/reliability', key: 'R', section: 'Triage', description: 'Correlated Vercel, Sentry and Supabase signals', meta: '3h' },
  // The self-healing circuit as a thing that can be watched. Distinct from
  // Jobs & Integrity, which answers "did the crons run": this answers "is the
  // loop alive, and has each stage ever actually produced its output" — a
  // stage can heartbeat healthily for a week while never once doing its job,
  // which is exactly what Repair did.
  { label: 'Self-heal', href: '/admin/self-heal', key: 'S', section: 'Triage', description: 'Collect, Diagnose, Repair, Close — runtime and capability', meta: 'loop' },
  // Was reachable ONLY from a text-xs back-arrow three levels deep, despite
  // being the one cross-sport board built to answer "who needs attention" —
  // 30-day activity/error EKG with four triage sorts.
  // The Flight Recorder tree. Distinct from the Golf Tracer at /admin/golf/tracer:
  // that answers "which rounds are stuck", this answers "walk me through one
  // execution and show me where it diverged".
  { label: 'Flight Recorder', href: '/admin/traces', key: 'F', section: 'Triage', description: 'One round mutation traced end to end', meta: 'trace' },
  // Qualifier lifecycle + the business rules rendered as live invariant checks.
  // Sits in Triage because a breached invariant (a round on another team's
  // qualifier) is an integrity incident, not a reporting curiosity.
  { label: 'Qualifiers', href: '/admin/qualifiers', key: 'Q', section: 'Triage', description: 'Qualifier lifecycle and rule invariants', meta: 'rules' },
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
  { label: 'Work log', href: '/admin/work', key: 'W', section: 'Platform', description: 'PR timeline — problems, fixes, areas', meta: 'prs' },
  // Distinct from the "Work log" tab above: that is the PR-timeline view
  // (github-pr-timeline.ts entries, problem/fix narrative), this is the
  // change-to-proof join over the SAME entries (repair verdict, shipped
  // release, post-deploy delta) — Bridge Premium Phase 5 (Engineering OS).
  { label: 'Proof Log', href: '/admin/work-log', key: 'X', section: 'Platform', description: 'PR → release shipped in → post-deploy proof', meta: 'proof' },
  { label: 'Engineering OS', href: '/admin/engineering', key: 'Y', section: 'Platform', description: 'Decision Inbox, Agent Flight Recorder, gates, blast radius', meta: 'os' },

  // LENSES — Bridge Premium Phase 4 (brief §20-27). Journey/flow-shaped
  // dominant visuals over the same underlying data the Apps/Customers tabs
  // above already surface — see each page's own header comment for what it
  // reuses vs. adds. Deliberately in Platform per that brief's routing, not
  // Apps/Customers, so it reads as an operating-model lens rather than a
  // second app tab competing with Golf/Baseball/Lift Lab/Teams/Users above.
  { label: 'Golf journey lens', href: '/admin/lenses/golf', key: 'G', section: 'Platform', description: 'Golf Journey River — funnel + incidents' },
  { label: 'Baseball journey lens', href: '/admin/lenses/baseball', key: 'A', section: 'Platform', description: 'Baseball journeys — funnel + incidents' },
  { label: 'Lift Lab flow lens', href: '/admin/lenses/lifting', key: 'P', section: 'Platform', description: 'Program Execution Flow, fully durable' },
  { label: 'Teams EKG lens', href: '/admin/lenses/teams', key: 'E', section: 'Platform', description: 'Team EKG + release impact + adoption' },
  { label: 'Users journey lens', href: '/admin/lenses/users', key: 'D', section: 'Platform', description: 'Directory + per-user Journey Ribbon' },

  // REVENUE — zero inbound links repo-wide before this entry.
  { label: 'Billing', href: '/admin/billing', key: 'V', section: 'Revenue', description: 'Create invoices' },

  // INTAKE
  { label: 'Ben + Leah', href: '/admin/ben-leah', key: 'B', section: 'Platform', description: 'Log tester-reported bugs on their behalf', meta: 'issues' },
] as const;

/** Quick links in the Overview command header — must be real ADMIN_NAV routes. */
export const ADMIN_COMMAND_SHORTCUTS = [
  { href: '/admin/errors', label: 'Errors' },
  { href: '/admin/health', label: 'Feature Map' },
  { href: '/admin/deploys', label: 'Deploys' },
  { href: '/admin/auth', label: 'Auth' },
] as const satisfies ReadonlyArray<{ href: AdminHref; label: string }>;

export function hrefForShortcut(key: string): string | null {
  return ADMIN_NAV.find((e) => e.key === key)?.href ?? null;
}

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
