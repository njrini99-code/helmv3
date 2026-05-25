'use client';

/**
 * Browser-side Web Push subscribe / unsubscribe helpers.
 *
 * Complements the native iOS APNs flow in `./push-registration.ts` — that
 * file owns Capacitor + APNs; this file owns Web Push (browser PushManager
 * + VAPID + the existing `public/sw.js` service worker).
 *
 * UI wiring (Settings → Notifications → Web Push toggle) ships in W42.
 * This file is the substrate W42 will call into.
 *
 * Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY at build time.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export interface SubscribeResult {
  ok: boolean;
  reason?:
    | 'unsupported'
    | 'no_vapid_key'
    | 'permission_denied'
    | 'server_error'
    | 'unknown_error';
  error?: string;
}

/**
 * Convert a base64url-encoded VAPID public key to the Uint8Array shape
 * the PushManager API requires.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    out[i] = rawData.charCodeAt(i);
  }
  return out;
}

/** Are we in a context that supports Web Push? */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Subscribe the current browser to Web Push and POST the subscription
 * to /api/push-subscriptions for server-side persistence.
 *
 * Idempotent: if a subscription already exists, the existing one is
 * reused (PushManager.subscribe returns it) and POSTed again — the API
 * upserts on (user_id, endpoint).
 *
 * Caller is responsible for:
 *   - Asking for Notification permission BEFORE calling this (so the
 *     UI can show context per Apple HIG).
 *   - Surfacing the reason on `ok: false`.
 */
export async function subscribeWebPush(): Promise<SubscribeResult> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'no_vapid_key' };
  }

  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    // PushManager.subscribe expects BufferSource; TS 5.x Uint8Array generics
    // require an explicit widen to ArrayBuffer.
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource;
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      }));

    const response = await fetch('/api/push-subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: 'server_error',
        error: `POST /api/push-subscriptions returned ${response.status}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Unsubscribe the current browser and DELETE the row server-side.
 * Safe to call when not currently subscribed (no-op).
 */
export async function unsubscribeWebPush(): Promise<SubscribeResult> {
  if (!isWebPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { ok: true };
    }
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const response = await fetch(
      `/api/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      return {
        ok: false,
        reason: 'server_error',
        error: `DELETE /api/push-subscriptions returned ${response.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
