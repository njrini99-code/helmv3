/**
 * local-supabase-csp.mjs — extra `connect-src` origins for a LOCAL Supabase stack,
 * and nothing else.
 *
 * WHY THIS EXISTS. `next.config.mjs`'s CSP allowed `https://*.supabase.co` plus
 * `ws://localhost:*` / `ws://127.0.0.1:*`. Those WebSocket entries are for Next's
 * HMR — so plain HTTP fetches to a loopback Supabase stack were blocked by our own
 * policy. The browser refused every `supabase-js` call with:
 *
 *   Connecting to 'http://127.0.0.1:54321/auth/v1/user' violates the following
 *   Content Security Policy directive: "connect-src 'self' https://*.supabase.co …"
 *
 * Two consequences, both unnoticed because nobody had run the app against a local
 * stack in a browser:
 *
 *   - `supabase start` + `npm run dev` could never authenticate client-side. The
 *     baseball dashboard sat forever on its bootstrap state ("Opening your command
 *     center") because the client `getUser()` fetch was refused, so
 *     `DashboardSessionGuard` never settled. That reads as a hang, not a CSP error.
 *   - The CI baseball smoke gate, once repointed at a local stack, failed all 16
 *     authenticated renders for exactly this reason. It was found in the Playwright
 *     trace's console output — the assertion message ("element(s) not found") could
 *     never have pointed at it.
 *
 * SCOPING IS THE ENTIRE POINT. The origin is derived from
 * `NEXT_PUBLIC_SUPABASE_URL` at build time and returned ONLY when it is loopback,
 * so production — where that variable is the `*.supabase.co` project URL — gets a
 * byte-identical CSP. It deliberately does NOT hardcode `http://127.0.0.1:*` into
 * the policy: that would loosen `connect-src` for every production visitor to buy a
 * developer convenience.
 *
 * Lives in its own module, rather than inline in next.config.mjs, so the scoping is
 * directly testable — see `__tests__/local-supabase-csp.test.ts`. The invariant
 * worth guarding is the negative one: a production URL must add nothing.
 */

/**
 * Hosts that are unambiguously this machine. Compared against the parsed URL's
 * host, never matched as a substring or a suffix — `https://127.0.0.1.evil.com`
 * and `https://localhost.attacker.net` must both return nothing.
 */
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * @returns {string} A leading-space-prefixed origin pair ready to concatenate into
 *   a `connect-src` list (`" http://127.0.0.1:54321 ws://127.0.0.1:54321"`), or
 *   `''` when the target is not a local stack.
 */
export function localSupabaseConnectSrc(
  rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
) {
  const raw = String(rawUrl).trim();
  if (!raw) return '';

  let origin;
  try {
    ({ origin } = new URL(raw));
  } catch {
    // An unparseable URL cannot be proven loopback, so add nothing.
    return '';
  }

  if (!LOOPBACK_ORIGIN.test(origin)) return '';

  // Supabase Realtime rides the same origin over ws(s):, so allow both schemes.
  return ` ${origin} ${origin.replace(/^http/i, 'ws')}`;
}
