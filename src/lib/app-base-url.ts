// ============================================================================
// APP BASE URL — shared fallback chain for building absolute app URLs
// ============================================================================
//
// Centralizes the base-URL resolution previously duplicated (and, at a few
// auth redirect call sites, missing entirely — a bare `undefined` env var
// baked straight into the URL) across the codebase. Mirrors the chain already
// established in src/lib/crm/unsubscribe-token.ts and
// src/lib/email/coach-digest-template.ts, with VERCEL_URL added as a preview-
// deploy fallback: branch/preview deployments get VERCEL_URL set
// automatically by Vercel but rarely have NEXT_PUBLIC_APP_URL /
// NEXT_PUBLIC_SITE_URL configured, so without this they'd fall straight
// through to the hardcoded production floor.
//
// Order:
//   1. NEXT_PUBLIC_SITE_URL — the explicit override already read (with no
//      fallback) by the golf/baseball auth redirect builders; kept first so
//      any environment that already configures it sees byte-identical
//      behavior.
//   2. NEXT_PUBLIC_APP_URL — the app-wide canonical base URL used by nearly
//      every other absolute-link builder in this codebase.
//   3. VERCEL_URL — the protocol-less host Vercel injects automatically;
//      normalized here with an https:// prefix.
//   4. 'https://helmsportslabs.com' — hardcoded production floor, the same
//      constant used throughout src/lib/notifications, src/lib/crm, etc.
//
// Trailing slashes are stripped so callers can safely template
// `${getAppBaseUrl()}/some/path` without risking a double slash.
// ============================================================================

/** Resolve the app's base URL for building absolute redirect/email links. */
export function getAppBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    vercelUrl ||
    'https://helmsportslabs.com';

  return raw.replace(/\/+$/, '');
}
