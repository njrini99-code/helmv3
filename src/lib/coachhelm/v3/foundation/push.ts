/**
 * v3 push provider — Web Push via VAPID.
 *
 * Static-imports `web-push@^3.6.7` (confirmed installed Task B, 2026-05-24)
 * and exposes a single `sendWebPush` entry point. Replaces the defensive
 * `await import('web-push').catch(() => null)` pattern that lived in
 * `src/app/golf/actions/task-reminders.ts` since before the package was
 * actually installed.
 *
 * SCOPE:
 *   - This module handles BROWSER Web Push only (PushManager subscriptions
 *     stored in `public.push_subscriptions`).
 *   - It does NOT handle native iOS APNs — those go through the existing
 *     Capacitor + registerDeviceToken pipeline in
 *     src/lib/utils/push-registration.ts (separate table, separate path).
 *
 * VAPID env vars (already declared in .env.example via .env.example
 * updates in W9-pt3):
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (client + server)
 *   - VAPID_PRIVATE_KEY (server-only)
 *   - VAPID_SUBJECT (server-only; defaults to mailto:admin@...)
 */

import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@helmsportslabs.com';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

/**
 * Shape of a row in `public.push_subscriptions`. Mirrors the verified
 * schema (2026-05-24): id, user_id, endpoint, expiration_time, keys (jsonb),
 * user_agent, device_name, created_at, updated_at, last_push_at, failed_count.
 */
export interface StoredPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  /** JSON shape: { p256dh: string; auth: string }. Stored as jsonb. */
  keys: { p256dh: string; auth: string };
  expiration_time?: string | null;
}

export interface WebPushPayload {
  title: string;
  body: string;
  /** Path the user lands on when they tap the notification. */
  url?: string;
  /** Optional badge / icon overrides. Service worker reads these. */
  icon?: string;
  badge?: string;
  /** Arbitrary data passed through to the service worker. */
  data?: Record<string, unknown>;
}

function isBlockedIpv6(literal: string): boolean {
  // `literal` is a bracket-stripped, lowercased IPv6 address. The WHATWG URL
  // parser has already validated and canonicalised it (`[0:0:0:0:0:0:0:1]` →
  // `[::1]`, `[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`), so a textual test on
  // the first hextet is sound.
  const groups = literal.split(':');
  // An empty first group means the address begins with `::` — that covers the
  // unspecified address, `::1` loopback, and every IPv4-mapped/compatible form
  // (`::ffff:7f00:1`). No real push service is reachable at one, so deny all.
  if (groups[0] === '') return true;
  // Hextets may omit leading zeros, so compare against the 4-digit form:
  // `fc0::1` is 0fc0:: and NOT unique-local, while `fc00::1` is.
  const first = (groups[0] ?? '').padStart(4, '0');
  if (first.startsWith('fc') || first.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true;                          // fe80::/10 link-local
  if (first.startsWith('ff')) return true;                           // ff00::/8 multicast
  return false;
}

/**
 * Sink-side SSRF guard: `webpush.sendNotification` opens a connection to
 * whatever host the stored `endpoint` names, so re-validate here rather than
 * trusting that every row was written through the API route. Rejects anything
 * that is not public HTTPS — localhost / `.internal`, IPv4
 * private/loopback/link-local/multicast, and IPv6 loopback, unique-local
 * (fc00::/7), link-local (fe80::/10) and multicast.
 *
 * The fc/fd tests are hex-byte tests on an IPv6 literal and MUST stay gated on
 * the hostname actually being bracketed — `'fcm.googleapis.com'.startsWith('fc')`
 * is true, and running them against DNS names rejects every Chrome/Edge/Android
 * subscription.
 *
 * Keep in sync with the identical guard in
 * src/app/api/push-subscriptions/route.ts.
 */
export function isSafePushEndpoint(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const rawHost = u.hostname.toLowerCase();
  const isIpv6Literal = rawHost.startsWith('[') && rawHost.endsWith(']');
  const h = isIpv6Literal ? rawHost.slice(1, -1) : rawHost;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return false;
  if (isIpv6Literal || h.includes(':')) {
    return !isBlockedIpv6(h);
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    // `?? -1` only satisfies noUncheckedIndexedAccess — the regex above has
    // already guaranteed four octets, so the fallback is unreachable.
    const octets = h.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false;
  }
  return true;
}

export interface SendWebPushResult {
  delivered: boolean;
  statusCode?: number;
  /** When statusCode is 404 or 410, the subscription is dead and should be deleted. */
  shouldDeleteSubscription?: boolean;
  error?: string;
}

/**
 * Send a Web Push notification to one subscription. Returns a result
 * object describing whether the push was accepted by the push service.
 *
 * Callers should:
 *   - Loop over `getActiveSubscriptionsFor(userId)` themselves.
 *   - DELETE rows where `result.shouldDeleteSubscription === true`.
 *   - Increment `failed_count` on transient errors; auto-delete after N.
 *
 * Returns `{ delivered: false }` (not throws) when VAPID isn't configured
 * so dev / preview environments degrade gracefully.
 */
export async function sendWebPush(
  subscription: StoredPushSubscription,
  payload: WebPushPayload,
): Promise<SendWebPushResult> {
  if (!ensureVapidConfigured()) {
    return {
      delivered: false,
      error: 'VAPID keys not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY',
    };
  }

  if (!isSafePushEndpoint(subscription.endpoint)) {
    return {
      delivered: false,
      error: 'Unsafe push endpoint — not a public HTTPS push service',
    };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };

  try {
    const result = await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
    );
    return {
      delivered: true,
      statusCode: result.statusCode,
    };
  } catch (err) {
    // web-push errors expose statusCode on the thrown object.
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode: unknown }).statusCode)
        : undefined;
    const shouldDeleteSubscription = statusCode === 404 || statusCode === 410;
    return {
      delivered: false,
      statusCode,
      shouldDeleteSubscription,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Whether VAPID is configured. Routes / cron jobs can short-circuit
 * early when false to avoid building payloads for nothing.
 */
export function isWebPushAvailable(): boolean {
  return ensureVapidConfigured();
}
