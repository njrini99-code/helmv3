import { isAdminPath } from '@/lib/admin/super-admin-shared';

/**
 * Open-redirect guard used by every auth entry point (login / welcome / signup
 * / reset) that takes a `next` or `returnTo` query parameter.
 *
 * A path is safe iff it starts with a known internal prefix (or is the
 * top-level Helm Bridge `/admin` surface — see `isAdminPath`) AND contains no
 * protocol-relative, backslash, or control-character tricks that some browsers
 * interpret as external origins.
 */
const INTERNAL_PREFIXES = ['/golf/', '/baseball/'] as const;

export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  // Reject protocol-relative (`//evil.com`) and backslash (`/\\evil.com`)
  // variants that Chrome/Safari collapse to external origins.
  if (path.includes('//') || path.includes('\\')) return false;
  // Reject embedded whitespace / control chars that can break URL parsing.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001F\u007F-\u009F]/.test(path)) return false;
  // `/admin` and `/admin/**` are a real, same-origin destination (the Helm
  // Bridge command center) — the middleware sends logged-out visitors here
  // with `?returnTo=/admin<path>` and the login flow must be able to honor
  // it. isAdminPath is a pure string check (no auth decision of its own);
  // the actual admin-access gate still runs downstream (requireSuperAdmin +
  // RLS), so allowing the path here does not widen who can reach it.
  return isAdminPath(path) || INTERNAL_PREFIXES.some((p) => path.startsWith(p));
}
