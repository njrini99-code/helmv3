import { isSafeInternalPath, toSameOriginPath } from '@/lib/utils/safe-redirect';

/**
 * Deep links (P001-C2): a helmsportslabs.com link opened from Messages, Mail or a push lands on its Clubhouse screen
 * inside the app rather than in Safari. Only our own hosts (the apex, www, or the origin the app runs on) and only
 * internal paths (`/golf/…`, `/baseball/…`; lib/utils/safe-redirect) get through; anything else is dropped.
 */
const APP_HOSTS = new Set(['helmsportslabs.com', 'www.helmsportslabs.com']);

export function deepLinkPath(raw: string | null | undefined, origin: string): string | null {
  if (!raw) return null;
  let path = toSameOriginPath(raw, origin);
  if (path === null) {
    try {
      const url = new URL(raw);
      if (url.protocol === 'https:' && APP_HOSTS.has(url.hostname)) path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return isSafeInternalPath(path) ? path : null;
}

/** The path and query of where the app is now, to tell a link to the screen already open from a real move. */
export function currentPath(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return `${loc.pathname}${loc.search}${loc.hash}`;
}
