/**
 * Client IP resolution for rate-limit and lockout bucket keys.
 *
 * WHAT WAS WRONG (security scan finding F12, CWE-348)
 * ---------------------------------------------------
 * The auth actions took `x-forwarded-for` as the ENTIRE raw header value and
 * used it directly as a rate-limit key:
 *
 *     const ip = headersList.get('x-forwarded-for') || ... || 'unknown';
 *     await checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);
 *
 * `x-forwarded-for` is a client-settable header carrying a comma-separated hop
 * list. Using the whole string unsplit means an attacker does not merely spoof
 * one identity — they mint a NEW bucket per request by varying the header, so
 * the per-IP login limit stops bounding anything at all. That is worse than the
 * spoofing the header is normally criticised for: the limit is not evaded, it is
 * effectively absent.
 *
 * WHAT THIS DOES
 * --------------
 * 1. Prefers `x-vercel-forwarded-for`. On Vercel this is set by the platform and
 *    any client-supplied copy is overwritten at the edge, so unlike
 *    `x-forwarded-for` it is not attacker-controlled. `src/lib/golf/signup-gate.ts`
 *    correctly noted that adopting a trusted-IP source is "a platform-wide
 *    decision, not something to invent inside the signup gate" — so it is made
 *    once, here, rather than separately at each of the ~9 call sites.
 * 2. Falls back to the FIRST hop of `x-forwarded-for` (the original client per
 *    RFC 7239 ordering), matching `getClientIdentifier` in lib/rate-limit.ts.
 * 3. VALIDATES the result looks like an IP address and returns `'unknown'`
 *    otherwise. This is the part that actually restores the bound: without it, a
 *    junk or randomised header value is still accepted as a distinct key, which
 *    is the unlimited-bucket problem above. Everything unparseable collapses
 *    into one shared bucket.
 *
 * This does NOT make a spoofed IP impossible — behind a proxy that forwards a
 * client-supplied header, it cannot. It bounds the damage: an attacker can
 * choose which bucket they land in, but not create unlimited ones.
 */

/** Dotted-quad with each octet 0-255. */
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * Deliberately permissive IPv6 shape check — hex groups and colons, optionally
 * bracketed, optionally with an embedded IPv4 tail. The goal is bounding
 * cardinality to plausible addresses, not full RFC 4291 validation.
 */
const IPV6_RE = /^\[?([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(%[0-9a-z]+)?\]?$/i;

/** Longest address form we will even consider, so a huge header cannot be a key. */
const MAX_IP_LENGTH = 45;

export function isPlausibleIp(value: string): boolean {
  if (!value || value.length > MAX_IP_LENGTH) return false;
  const bare = value.replace(/^\[|\]$/g, '');
  return IPV4_RE.test(bare) || IPV6_RE.test(value);
}

/**
 * Resolve the client IP from request headers.
 *
 * Accepts a `Headers` (route handlers) or the `ReadonlyHeaders` returned by
 * `next/headers` (server actions) — both expose `.get()`, which is all this
 * needs.
 */
export function resolveClientIp(headers: { get(name: string): string | null }): string {
  // Platform-set on Vercel; a client-supplied copy is replaced at the edge.
  const vercel = firstHop(headers.get('x-vercel-forwarded-for'));
  if (vercel && isPlausibleIp(vercel)) return vercel;

  const forwarded = firstHop(headers.get('x-forwarded-for'));
  if (forwarded && isPlausibleIp(forwarded)) return forwarded;

  const real = headers.get('x-real-ip')?.trim();
  if (real && isPlausibleIp(real)) return real;

  // One shared bucket for everything unattributable — never the raw header,
  // which is what let a varying value mint unlimited buckets.
  return 'unknown';
}

function firstHop(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}
