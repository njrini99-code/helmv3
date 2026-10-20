/* global process, URL -- both built into Node. This file lives under src/,
   where eslint.config.mjs grants no Node globals. It is imported by
   next.config.mjs at build time, so it must stay a plain, dependency-free ESM
   module. */
/**
 * supabase-csp.mjs — the Supabase hosts the Content-Security-Policy trusts.
 *
 * WHY THIS EXISTS. `connect-src` and `frame-src` used to allow
 * `*.supabase.co`, which is every Supabase project in existence. Anyone can
 * create one, so an injected script could send data to an attacker's project
 * and the browser would allow it. The image allowlist dropped the same
 * wildcard for GHSA-cjq9-62q9-8jv4 (see image-remote-patterns.mjs).
 *
 * WHAT IS ALLOWED. The production project, plus the project that
 * `NEXT_PUBLIC_SUPABASE_URL` points at when it is a different
 * `https://<ref>.supabase.co` origin (a preview or branch project). Loopback
 * stacks are handled by local-supabase-csp.mjs.
 *
 * Tested in `__tests__/supabase-csp.test.ts`.
 */

import { PRODUCTION_SUPABASE_HOST } from './image-remote-patterns.mjs';

/** One project label under supabase.co: `<ref>.supabase.co`, nothing deeper. */
const SUPABASE_PROJECT_HOST = /^[a-z0-9-]+\.supabase\.co$/i;

/**
 * @param {string} [rawUrl] The configured Supabase URL. Defaults to
 *   `NEXT_PUBLIC_SUPABASE_URL`.
 * @returns {string[]} Bare hostnames, production first, no duplicates.
 */
export function supabaseCspHosts(rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') {
  const hosts = [PRODUCTION_SUPABASE_HOST];
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return hosts;
  }
  if (url.username || url.password) return hosts;
  const host = url.hostname.toLowerCase();
  if (
    url.protocol === 'https:' &&
    !url.port &&
    SUPABASE_PROJECT_HOST.test(host) &&
    !hosts.includes(host)
  ) {
    hosts.push(host);
  }
  return hosts;
}

/** `connect-src` sources: REST/auth/storage over https and Realtime over wss. */
export function supabaseConnectSrc(rawUrl) {
  return supabaseCspHosts(rawUrl)
    .flatMap((h) => [`https://${h}`, `wss://${h}`])
    .join(' ');
}

/** `frame-src` sources: storage objects shown in an iframe (PDF previews). */
export function supabaseFrameSrc(rawUrl) {
  return supabaseCspHosts(rawUrl)
    .map((h) => `https://${h}`)
    .join(' ');
}
