type AdminHref =
  | '/admin'
  | '/admin/activity'
  | '/admin/errors'
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
  { label: 'Errors', href: '/admin/errors', key: '3', section: 'Triage', description: 'Sentry plus app incident groups', meta: 'trace' },
  { label: 'Health', href: '/admin/health', key: '0', section: 'Triage', description: 'Feature health across every app', meta: 'map' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '8', section: 'Triage', description: 'Crons, guards, integrity checks' },
  // Was reachable ONLY from a text-xs back-arrow three levels deep, despite
  // being the one cross-sport board built to answer "who needs attention" —
  // 30-day activity/error EKG with four triage sorts.
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
  { label: 'Auth & Sign-ins', href: '/admin/auth', key: '4', section: 'Platform', description: 'Access, sessions, auth failures' },
  { label: 'Work log', href: '/admin/work', key: 'W', section: 'Platform', description: 'PR timeline — problems, fixes, areas', meta: 'prs' },

  // REVENUE — zero inbound links repo-wide before this entry.
  { label: 'Billing', href: '/admin/billing', key: 'V', section: 'Revenue', description: 'Invoices, Stripe posture' },

  // INTAKE
  { label: 'Ben + Leah', href: '/admin/ben-leah', key: 'B', section: 'Platform', description: 'Submit bugs, changes, additions', meta: 'issues' },
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
  '/admin/errors': 'Errors',
  '/admin/health': 'Health',
  '/admin/users': 'Users',
};
