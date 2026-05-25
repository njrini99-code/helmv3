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
