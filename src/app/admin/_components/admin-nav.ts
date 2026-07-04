type AdminHref =
  | '/admin'
  | '/admin/activity'
  | '/admin/errors'
  | '/admin/auth'
  | '/admin/golf'
  | '/admin/baseball'
  | '/admin/ben-leah'
  | '/admin/work'
  | '/admin/users'
  | '/admin/jobs'
  | '/admin/deploys'
  | '/admin/health';

export interface AdminNavEntry {
  label: string;
  href: AdminHref;
  key: string;
  section: 'Operations' | 'Apps' | 'Platform';
  description: string;
  meta?: string;
}

/** The primary Bridge tabs. Order is the keyboard map: '1'-'9' for the first
 *  nine tabs, '0' for Health, and 'B' for the Ben + Leah intake desk. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { label: 'Overview', href: '/admin', key: '1', section: 'Operations', description: 'Command posture, triage, deploys', meta: 'live' },
  { label: 'Activity', href: '/admin/activity', key: '2', section: 'Operations', description: 'User and product event stream' },
  { label: 'Errors', href: '/admin/errors', key: '3', section: 'Operations', description: 'Sentry plus app incident groups', meta: 'trace' },
  { label: 'Auth & Sign-ins', href: '/admin/auth', key: '4', section: 'Operations', description: 'Access, sessions, auth failures' },
  { label: 'Golf', href: '/admin/golf', key: '5', section: 'Apps', description: 'GolfHelm production signals' },
  { label: 'Baseball', href: '/admin/baseball', key: '6', section: 'Apps', description: 'BaseballHelm production signals' },
  { label: 'Ben + Leah', href: '/admin/ben-leah', key: 'B', section: 'Operations', description: 'Submit bugs, changes, additions', meta: 'issues' },
  { label: 'Work log', href: '/admin/work', key: 'W', section: 'Operations', description: 'PR timeline — problems, fixes, areas', meta: 'prs' },
  { label: 'Users & Teams', href: '/admin/users', key: '7', section: 'Platform', description: 'Accounts, teams, engagement' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '8', section: 'Platform', description: 'Crons, guards, integrity checks' },
  { label: 'Deploys & Infra', href: '/admin/deploys', key: '9', section: 'Platform', description: 'Vercel releases and web insight' },
  { label: 'Health', href: '/admin/health', key: '0', section: 'Platform', description: 'Feature health across every app', meta: 'map' },
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
