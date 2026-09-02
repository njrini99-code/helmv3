// =============================================================================
// SSRF guards for stored, user-supplied outbound URLs.
//
// The web-push endpoint is a request-forgery sink: any authenticated user can
// store one, and a later job (`sendWebPush`, driven by task reminders and
// calendar notifications) hands it to `webpush.sendNotification`, so the
// SERVER opens the connection.
//
// The original guard lived inline in src/app/api/push-subscriptions/route.ts
// and was hand-copied into src/lib/coachhelm/v3/foundation/push.ts. Both copies
// tested the hostname STRING only, so they rejected `https://127.0.0.1/x` but
// happily accepted `https://attacker-dns-name.example/x` pointing at the same
// address. Two copies also meant a fix to one silently left the other open.
// This module is the single implementation both now import.
//
// PURE-ish: no DB, no DOM. `resolvesToPublicHost` performs DNS.
// =============================================================================

import { promises as dns } from 'node:dns';

/** True for an IPv4 literal in a private, loopback, link-local or multicast range. */
export function isBlockedIpv4(literal: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(literal)) return false;
  const octets = literal.split('.').map(Number);
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * True for a blocked IPv6 literal. `literal` is bracket-stripped and lowercased;
 * the WHATWG URL parser has already canonicalised it (`[::ffff:127.0.0.1]` ->
 * `[::ffff:7f00:1]`), so a textual test on the first hextet is sound.
 */
export function isBlockedIpv6(literal: string): boolean {
  const groups = literal.split(':');
  // A leading `::` covers the unspecified address, `::1` loopback, and every
  // IPv4-mapped/compatible form. No real push service is reachable at one.
  if (groups[0] === '') return true;
  // Hextets may omit leading zeros, so compare the 4-digit form: `fc0::1` is
  // 0fc0:: and NOT unique-local, while `fc00::1` is.
  const first = (groups[0] ?? '').padStart(4, '0');
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // fc00::/7
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (first.startsWith('ff')) return true; // ff00::/8 multicast
  return false;
}

/** Literal-address check used for both parsed hostnames and resolved records. */
export function isBlockedAddress(address: string): boolean {
  const h = address.toLowerCase();
  if (h.includes(':')) return isBlockedIpv6(h);
  return isBlockedIpv4(h);
}

/**
 * Synchronous shape check: HTTPS, not an obvious internal name, and not a
 * literal address in a blocked range. This is necessary but NOT sufficient —
 * it cannot see where a DNS name points. Callers that will actually open the
 * connection must use `isSafePushEndpoint` below.
 */
export function isSafePushEndpointShape(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const rawHost = u.hostname.toLowerCase();
  // `URL.hostname` keeps the brackets around an IPv6 literal. Track that BEFORE
  // stripping them: the fc/fd tests are hex-byte tests and must never run
  // against a DNS name — `'fcm.googleapis.com'.startsWith('fc')` is true, which
  // would reject every Chrome/Android push subscription.
  const isIpv6Literal = rawHost.startsWith('[') && rawHost.endsWith(']');
  const h = isIpv6Literal ? rawHost.slice(1, -1) : rawHost;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return false;
  if (isIpv6Literal || h.includes(':')) return !isBlockedIpv6(h);
  return !isBlockedIpv4(h);
}

/**
 * Resolve a hostname and reject it if ANY returned record points somewhere
 * internal. A name with one public and one private record is rejected: the
 * resolver picks per connection, so a mixed answer is not safe.
 *
 * Returns true for a literal address (nothing to resolve) that already passed
 * the shape check.
 */
export async function resolvesToPublicHost(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // Already an address: the shape check settled it, there is no lookup to do.
  if (h.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return !isBlockedAddress(h);

  let records: { address: string }[];
  try {
    records = await dns.lookup(h, { all: true, verbatim: true });
  } catch {
    // Cannot establish where this points, so refuse it. Failing open here is
    // what the string-only guard effectively did.
    return false;
  }
  if (records.length === 0) return false;
  return records.every((r) => !isBlockedAddress(r.address));
}

/**
 * Full check: shape + DNS resolution. Use this at BOTH ends — when storing a
 * user-supplied endpoint and again immediately before sending to it.
 *
 * Residual risk, stated plainly: this does not pin the resolved address for the
 * connection that follows, so a name whose records change between this check
 * and `sendNotification` (DNS rebinding) is still possible. Re-validating at
 * send time shrinks that window to the duration of one call rather than the
 * lifetime of a stored row, which is the part that actually mattered here.
 */
export async function isSafePushEndpoint(raw: string): Promise<boolean> {
  if (!isSafePushEndpointShape(raw)) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return resolvesToPublicHost(u.hostname);
}
