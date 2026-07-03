export interface AdminNavEntry {
  label: string;
  href: string;
  key: string;
}

/** The 10 tabs. Order is the keyboard map: '1'-'9' for the first nine tabs,
 *  '0' for the tenth (Health) — there is no single digit past 9. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { label: 'Overview', href: '/admin', key: '1' },
  { label: 'Activity', href: '/admin/activity', key: '2' },
  { label: 'Errors', href: '/admin/errors', key: '3' },
  { label: 'Auth & Sign-ins', href: '/admin/auth', key: '4' },
  { label: 'Golf', href: '/admin/golf', key: '5' },
  { label: 'Baseball', href: '/admin/baseball', key: '6' },
  { label: 'Users & Teams', href: '/admin/users', key: '7' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '8' },
  { label: 'Deploys & Infra', href: '/admin/deploys', key: '9' },
  { label: 'Health', href: '/admin/health', key: '0' },
] as const;

export function hrefForShortcut(key: string): string | null {
  return ADMIN_NAV.find((e) => e.key === key)?.href ?? null;
}
