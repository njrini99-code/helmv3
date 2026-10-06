/* global process, URL -- both built into Node. This file lives under src/,
   where eslint.config.mjs grants no Node globals (see local-supabase-csp.mjs for
   the same directive). It is imported by next.config.mjs at build time, so it
   must stay a plain, dependency-free ESM module. */
/**
 * image-remote-patterns.mjs — the `images.remotePatterns` allowlist for
 * next/image's optimizer, and nothing wider.
 *
 * WHY THIS EXISTS. The optimizer (`/_next/image?url=…`) fetches any URL that
 * matches `remotePatterns` server-side. GHSA-cjq9-62q9-8jv4 (image-optimization
 * SSRF, Next <= 16.3.7, fixed in 16.3.8) needs an allowlisted host an attacker
 * can influence. The previous `**.supabase.co` wildcard allowed every Supabase
 * project in existence, and anyone can create one. The previous config also
 * allowed loopback (`127.0.0.1:54321` / `localhost:54321`) in every build,
 * production included.
 *
 * WHAT IS ALLOWED.
 *   - The production project's public storage
 *     (`https://qmnssrrolpinvwjjnufo.supabase.co/storage/v1/object/public/**`).
 *     In October 2026, every image-URL column in production held only this host
 *     (plus a few demo thumbnails on a non-Supabase host, which the old wildcard
 *     never allowed either).
 *   - The project that `NEXT_PUBLIC_SUPABASE_URL` points at, but only when it is
 *     a `*.supabase.co` https origin or a loopback origin. The loopback case is
 *     the local `supabase start` stack used by `npm run dev` and CI E2E. So
 *     loopback reaches the allowlist only in a build whose Supabase *is*
 *     loopback, never in a production build. This is the same scoping as
 *     `local-supabase-csp.mjs`.
 *
 * Tested in `__tests__/image-remote-patterns.test.ts`. The invariant worth
 * guarding is the negative one: a production build must not allow another
 * project or loopback.
 */

export const PRODUCTION_SUPABASE_HOST = 'qmnssrrolpinvwjjnufo.supabase.co';

const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/**';

/** A loopback host must be the WHOLE host, never a prefix or a substring. */
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])$/i;

/** One project label under supabase.co: `<ref>.supabase.co`, nothing deeper. */
const SUPABASE_PROJECT_HOST = /^[a-z0-9-]+\.supabase\.co$/i;

/**
 * @param {string} [rawUrl] The configured Supabase URL. Defaults to
 *   `NEXT_PUBLIC_SUPABASE_URL`.
 * @returns {Array<{protocol: 'http' | 'https', hostname: string, port?: string, pathname: string}>}
 */
export function imageRemotePatterns(
  rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
) {
  /** @type {Array<{protocol: 'http' | 'https', hostname: string, port?: string, pathname: string}>} */
  const patterns = [
    { protocol: 'https', hostname: PRODUCTION_SUPABASE_HOST, pathname: PUBLIC_STORAGE_PATH },
  ];

  const raw = String(rawUrl).trim();
  if (!raw) return patterns;

  let url;
  try {
    url = new URL(raw);
  } catch {
    // An unparseable URL cannot be proven safe, so add nothing.
    return patterns;
  }
  // Reject userinfo outright: `https://127.0.0.1@evil.com` must not be read as loopback.
  if (url.username || url.password) return patterns;

  const host = url.hostname.toLowerCase();

  if (LOOPBACK_HOST.test(host) && (url.protocol === 'http:' || url.protocol === 'https:')) {
    patterns.push({
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      hostname: host,
      ...(url.port ? { port: url.port } : {}),
      pathname: PUBLIC_STORAGE_PATH,
    });
    return patterns;
  }

  if (
    url.protocol === 'https:' &&
    !url.port &&
    SUPABASE_PROJECT_HOST.test(host) &&
    host !== PRODUCTION_SUPABASE_HOST
  ) {
    patterns.push({ protocol: 'https', hostname: host, pathname: PUBLIC_STORAGE_PATH });
  }

  return patterns;
}
