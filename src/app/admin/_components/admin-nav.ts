export interface AdminNavEntry {
  label: string;
  href: string;
  key: string;
}

/** The 8 tabs. Order is the keyboard map (1-8). */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { label: 'Overview', href: '/admin', key: '1' },
  { label: 'Errors', href: '/admin/errors', key: '2' },
  { label: 'Auth & Sign-ins', href: '/admin/auth', key: '3' },
  { label: 'Golf', href: '/admin/golf', key: '4' },
  { label: 'Baseball', href: '/admin/baseball', key: '5' },
  { label: 'Users & Teams', href: '/admin/users', key: '6' },
  { label: 'Jobs & Integrity', href: '/admin/jobs', key: '7' },
  { label: 'Deploys & Infra', href: '/admin/deploys', key: '8' },
] as const;

export function hrefForShortcut(key: string): string | null {
  return ADMIN_NAV.find((e) => e.key === key)?.href ?? null;
}
