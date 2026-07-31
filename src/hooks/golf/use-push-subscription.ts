'use client';

/**
 * Web Push subscription lifecycle — the missing client half of "Option B"
 * (android/playstore/SUBMISSION.md §3): VAPID keys have been live in Vercel
 * production for 67 days, `/api/push-subscriptions` has always been able to
 * persist a subscription, and `public/sw.js` has always had `push` +
 * `notificationclick` handlers — but nothing in the app ever called
 * `pushManager.subscribe()`, so `push_subscriptions` stayed empty. This hook
 * is that call.
 *
 * Server contract (must match EXACTLY — see the payload validator in
 * src/app/api/push-subscriptions/route.ts):
 *   POST   { endpoint, expirationTime?: number|null, keys: { p256dh, auth } }
 *   DELETE ?endpoint=<endpoint>
 * Both are the standard `PushSubscription.toJSON()` shape — no transform.
 *
 * Idempotency: the mount-time effect only ever calls the read-only
 * `pushManager.getSubscription()` to resolve current state — it NEVER
 * subscribes and NEVER POSTs. A network write only happens inside
 * `subscribe()` / `unsubscribe()`, and those must be invoked from a user
 * gesture (`Notification.requestPermission()` requires one inside the
 * Capacitor WebView, same as in a normal browser tab) — wire them to a click
 * handler / Switch `onCheckedChange`, never to a `useEffect`.
 *
 * Scope: browser Web Push only. Native iOS APNs registration is a separate,
 * pre-existing pipeline (`src/lib/utils/push-registration.ts` /
 * `registerDeviceToken`, different table) and is untouched by this hook.
 * `PushManager` does not exist in iOS WKWebView, so `isSupported()` is
 * `false` there and callers should render nothing — that's intentional, not
 * a bug: iOS push goes through the APNs path instead.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type PushSubscriptionStatus =
  | 'checking'
  | 'unsupported'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed';

export interface PushSubscriptionActionResult {
  ok: boolean;
  /** Present only when `ok` is false and the failure isn't a permission denial. */
  error?: string;
}

interface UsePushSubscriptionResult {
  status: PushSubscriptionStatus;
  /** True while a subscribe/unsubscribe round-trip is in flight. */
  pending: boolean;
  /** Call from a click handler / Switch onCheckedChange — never on mount. */
  subscribe: () => Promise<PushSubscriptionActionResult>;
  unsubscribe: () => Promise<PushSubscriptionActionResult>;
}

/** Standard base64url → Uint8Array, as required by `applicationServerKey`. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * The app's service worker is only ever registered in production
 * (`use-service-worker.ts` deliberately unregisters + skips in dev — a dev
 * machine has no offline story worth a poisoned cache). `serviceWorker.ready`
 * never resolves without a registration, so racing this hook's dev behavior
 * against a promise that can hang forever would leave the switch stuck on
 * "checking". Match the same production-only gate instead of reinventing one.
 */
function pushEnvironmentReady(): boolean {
  return isSupported() && process.env.NODE_ENV === 'production';
}

/** Bounds `navigator.serviceWorker.ready` — it can hang forever if the SW
 * registration itself fails silently (blocked storage, disabled SW, etc). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function readExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await withTimeout(
    navigator.serviceWorker.ready,
    8000,
    'Service worker is not ready.',
  );
  return registration.pushManager.getSubscription();
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const [status, setStatus] = useState<PushSubscriptionStatus>('checking');
  const [pending, setPending] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Read-only mount check — resolves the toggle's initial position without
  // ever subscribing or POSTing (idempotency requirement: mounting this
  // hook any number of times per session costs zero writes).
  useEffect(() => {
    if (!pushEnvironmentReady()) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const existing = await readExistingSubscription();
        if (!cancelled) setStatus(existing ? 'subscribed' : 'unsubscribed');
      } catch {
        if (!cancelled) setStatus('unsubscribed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<PushSubscriptionActionResult> => {
    if (!pushEnvironmentReady()) {
      return { ok: false, error: 'Push notifications are not supported in this browser.' };
    }

    setPending(true);
    try {
      // Must run inside the caller's user-gesture call stack — do not await
      // anything above this line.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (mountedRef.current) setStatus('denied');
        return { ok: false };
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        return { ok: false, error: 'Push notifications are not configured yet.' };
      }

      const registration = await withTimeout(
        navigator.serviceWorker.ready,
        8000,
        'Service worker is not ready.',
      );
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // TS's `BufferSource` (lib.dom) doesn't accept the generic
          // `Uint8Array<ArrayBufferLike>` shape newer TS infers here even
          // though it's a valid BufferSource at runtime — cast, don't fight it.
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
      }

      const json = subscription.toJSON() as {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('Browser returned an incomplete push subscription.');
      }

      const res = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          expirationTime: json.expirationTime ?? null,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Failed to save subscription (${res.status})`);
      }

      if (mountedRef.current) setStatus('subscribed');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to enable push notifications.',
      };
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<PushSubscriptionActionResult> => {
    if (!pushEnvironmentReady()) return { ok: true };

    setPending(true);
    try {
      const registration = await withTimeout(
        navigator.serviceWorker.ready,
        8000,
        'Service worker is not ready.',
      );
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        const res = await fetch(
          `/api/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          // The browser-side unsubscribe already happened, so the switch
          // still flips off — a failed server delete just leaves a stale
          // row, which `sendWebPush`'s 404/410 prune already cleans up on
          // the next send attempt. Surface the failure but don't roll back.
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (mountedRef.current) setStatus('unsubscribed');
          return {
            ok: false,
            error: body?.error || `Unsubscribed on this device, but the server row failed to clear (${res.status}).`,
          };
        }
      }
      if (mountedRef.current) setStatus('unsubscribed');
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to disable push notifications.',
      };
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, []);

  return { status, pending, subscribe, unsubscribe };
}
