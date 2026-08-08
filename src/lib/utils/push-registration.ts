'use client';

import { Capacitor } from '@capacitor/core';
import { isNativeApp } from './capacitor';
import { isSafeInternalPath } from './safe-redirect';
import { fwHaptic } from '@/lib/fairway/haptics';

/**
 * Push events are surfaced to React as DOM CustomEvents rather than via a
 * store, because the Capacitor listeners are registered once at app boot from
 * a plain module that has no access to the router or to React context.
 *
 * Both are `cancelable`. A listener that has actually handled the event calls
 * `preventDefault()`, which makes `dispatchEvent` return false — that is how
 * the emitter distinguishes "a component took care of this" from "nothing was
 * mounted to hear it" and decides whether it still needs the hard fallback.
 */
export const PUSH_NAVIGATE_EVENT = 'helm:push-navigate';
export const PUSH_RECEIVED_EVENT = 'helm:push-received';

export interface PushNavigateDetail { url: string }
export interface PushReceivedDetail {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** Returns true when a listener claimed the event via preventDefault(). */
function dispatchPushEvent(name: string, detail: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const delivered = window.dispatchEvent(
    new CustomEvent(name, { detail, cancelable: true }),
  );
  return !delivered;
}

/**
 * Push notification registration for iOS (Capacitor).
 *
 * iOS UX best practice (Apple HIG): before calling the system permission
 * prompt, show a "soft ask" that explains WHY we want to notify the user.
 * The system prompt can only be shown ONCE — if the user denies it there,
 * the only way back is Settings. So we gate it behind a pre-prompt sheet.
 *
 * Flow:
 *   1. App launches → `initPushListeners()` wires up listeners only
 *      (no permission prompt, no system dialog).
 *   2. Dashboard shell renders → shows a soft-ask Drawer on first
 *      visit (tracked via localStorage).
 *   3. User taps "Enable" → `requestPushPermission()` shows the system
 *      prompt and registers with APNs on grant.
 *   4. User taps "Not now" → we record the choice and don't nag again.
 */

const SOFT_ASK_STORAGE_KEY = 'golfhelm-push-soft-ask-state';

type SoftAskState = 'pending' | 'accepted' | 'dismissed';

function getPushSoftAskState(): SoftAskState {
  if (typeof window === 'undefined') return 'pending';
  try {
    const raw = window.localStorage.getItem(SOFT_ASK_STORAGE_KEY);
    if (raw === 'accepted' || raw === 'dismissed') return raw;
  } catch {
    // localStorage unavailable
  }
  return 'pending';
}

export function setPushSoftAskState(state: SoftAskState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOFT_ASK_STORAGE_KEY, state);
  } catch {
    // localStorage unavailable
  }
}

/**
 * The device token APNs/FCM handed us, held until it is accepted by the server.
 *
 * APNs fires `registration` exactly ONCE per launch, and on a cold start it
 * fires while the app is still sitting on the login screen — there is no
 * session, so `registerDeviceToken` answers UNAUTHORIZED_RETRYABLE. The old
 * code treated that as a cookie-propagation race and retried for ~15 seconds,
 * which cannot succeed when the truth is "this person has not logged in yet":
 * the token was then dropped for the rest of the launch and the device silently
 * received no push at all. 6 of 7 registrations in the week to 2026-08-06 never
 * landed a token that way. Parking it here lets the login itself complete the
 * handshake — see flushPendingDeviceToken.
 */
let pendingDeviceToken: { value: string; platform: 'ios' | 'android' } | null = null;
/** Guards against two flushes racing (auth event + app-resume, say). */
let deviceTokenSubmitInFlight = false;

/**
 * Try to hand the parked token to the server, with a short backoff for the
 * genuine case the old comment described (session cookie mid-propagation).
 *
 * Keeps the token parked on an auth failure so a later flush can retry; clears
 * it on success, and on a NON-retryable rejection where retrying is pointless.
 */
async function submitPendingDeviceToken(): Promise<void> {
  if (!pendingDeviceToken || deviceTokenSubmitInFlight) return;
  deviceTokenSubmitInFlight = true;
  try {
    const { registerDeviceToken } = await import('@/app/golf/actions/push-notifications');
    const backoffsMs = [1000, 2000, 4000, 8000];
    let lastError: unknown;
    for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
      const token = pendingDeviceToken;
      if (!token) return;
      try {
        const result = await registerDeviceToken(token.value, token.platform);
        if (result.success) {
          pendingDeviceToken = null;
          return;
        }
        if (!result.retryable) {
          // A rejection that retrying cannot fix (malformed payload). Drop it
          // rather than re-attempting on every future auth event.
          pendingDeviceToken = null;
          console.error('[Push] Failed to save device token:', result.error);
          return;
        }
        lastError = result.error;
      } catch (err) {
        // Transient transport/import failures are retryable too — keep
        // looping through the backoff rather than bailing on the first one.
        lastError = err;
      }
      if (attempt < backoffsMs.length) {
        await new Promise((resolve) => setTimeout(resolve, backoffsMs[attempt]));
      }
    }
    // Still unauthorized. The token STAYS parked: the user has most likely not
    // signed in yet, and flushPendingDeviceToken will finish the job the moment
    // they do.
    console.warn('[Push] Device token not registered yet; will retry when a session exists', lastError);
  } finally {
    deviceTokenSubmitInFlight = false;
  }
}

/**
 * Submit the parked device token now that a session should exist.
 *
 * Call this on sign-in. No-op when nothing is parked, so it is safe to call on
 * every auth event.
 */
export async function flushPendingDeviceToken(): Promise<void> {
  if (!pendingDeviceToken) return;
  await submitPendingDeviceToken();
}

/** Test seam — the parked token is module state with no other way in. */
export async function __setPendingDeviceTokenForTest(
  token: { value: string; platform: 'ios' | 'android' } | null,
): Promise<void> {
  pendingDeviceToken = token;
}

/** Test seam — see above. */
export function __getPendingDeviceTokenForTest(): { value: string; platform: 'ios' | 'android' } | null {
  return pendingDeviceToken;
}

/**
 * Wire up push notification listeners without prompting for permission.
 * Safe to call on every app launch.
 */
export async function initPushListeners(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Guard against a native build where the JS dependency is present
    // (package.json) but the plugin was never registered on the native
    // platform project (e.g. missing from android/capacitor.settings.gradle
    // autolinking). Without this check, the addListener() calls below still
    // fire and their returned promises reject ASYNCHRONOUSLY with "plugin is
    // not implemented" — none of those calls are awaited, so an unattached
    // rejection reaches the global unhandled-rejection handler and pollutes
    // the error feed. This was the "PushNotifications plugin is not
    // implemented on android" incident.
    if (!Capacitor.isPluginAvailable('PushNotifications')) return;

    // If permission was previously granted, silently re-register with APNs
    // so the token stays fresh.
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'granted') {
      await PushNotifications.register();
    }

    // Listen for the registration event (fires once per session with APNs token)
    PushNotifications.addListener('registration', async (token) => {
      // Was hardcoded 'ios'. On Android this listener fires with an **FCM**
      // token, and storing it as 'ios' sends it to `send-apns-push`, where
      // Apple rejects it — silently, since a rejected token just increments
      // failed_count. Read the real platform so `sendPushNotification` can
      // route to the right transport.
      const platform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios';
      // Park it before trying. APNs delivers the token ONCE per launch, so if
      // the submit below fails there is no second event to fall back on — the
      // token has to survive until a session exists. See flushPendingDeviceToken.
      pendingDeviceToken = { value: token.value, platform };
      await submitPendingDeviceToken();
    }).catch((err) => {
      // addListener() itself rejects async when the plugin is unavailable —
      // separate from anything the callback above does.
      console.error('[Push] addListener("registration") failed:', err);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration failed:', error);
    }).catch(() => {});

    // Foreground notifications are displayed by the system based on
    // capacitor.config.ts presentationOptions: ["badge", "sound", "alert"].
    // We additionally surface them in-app: previously this only console.log'd,
    // so a notification arriving while the user was looking at the app updated
    // nothing on screen.
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      fwHaptic('light');
      dispatchPushEvent(PUSH_RECEIVED_EVENT, {
        title: notification.title ?? '',
        body: notification.body ?? '',
        data: (notification.data ?? {}) as Record<string, unknown>,
      });
    }).catch(() => {});

    // Tap handler — deep-link via the URL in the notification payload.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      if (typeof window === 'undefined') return;
      const data = action.notification.data as Record<string, unknown> | undefined;
      const rawUrl = typeof data?.url === 'string' ? data.url : null;

      // SECURITY: the payload is attacker-influenceable in any scenario where a
      // send path can be tricked into echoing user input, and this assignment
      // used to accept it verbatim — an absolute `https://evil.example` would
      // navigate the whole webview off-origin while still wearing the app's
      // chrome. Only same-origin internal paths are allowed through.
      if (!rawUrl || !isSafeInternalPath(rawUrl)) return;

      fwHaptic('selection');

      // Prefer an in-app route transition. A full location assignment tears
      // down and re-cold-starts the SPA (re-auth, re-fetch, splash) for what
      // should be an instant push into an existing screen. The provider that
      // owns the Next router listens for this and calls router.push; if
      // nothing is listening (listener not yet mounted on a cold launch from a
      // tapped notification) we fall back to the hard navigation.
      const handled = dispatchPushEvent(PUSH_NAVIGATE_EVENT, { url: rawUrl });
      if (!handled) window.location.href = rawUrl;
    }).catch(() => {});
  } catch (err) {
    console.error('[Push] Listener setup failed:', err);
  }
}

/**
 * Determine whether the app should show the soft-ask pre-prompt to the user.
 *
 * Returns true only when:
 *  - Running on a native iOS build
 *  - System permission is still `prompt` (never asked)
 *  - User has not previously accepted or dismissed the soft-ask
 */
export async function shouldShowPushSoftAsk(): Promise<boolean> {
  if (!isNativeApp()) return false;

  const localState = getPushSoftAskState();
  if (localState !== 'pending') return false;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permStatus = await PushNotifications.checkPermissions();
    return permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale';
  } catch {
    return false;
  }
}

/**
 * Trigger the system permission prompt and register with APNs on grant.
 * Call this from the soft-ask sheet's "Enable" button.
 */
export async function requestPushPermission(): Promise<'granted' | 'denied'> {
  if (!isNativeApp()) {
    setPushSoftAskState('dismissed');
    return 'denied';
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.requestPermissions();

    if (result.receive === 'granted') {
      setPushSoftAskState('accepted');
      await PushNotifications.register();
      return 'granted';
    }

    setPushSoftAskState('dismissed');
    return 'denied';
  } catch (err) {
    console.error('[Push] Permission request failed:', err);
    setPushSoftAskState('dismissed');
    return 'denied';
  }
}



/**
 * Clear delivered notifications from Notification Center.
 *
 * ⚠️ This does NOT clear the app icon badge, despite the name it shipped under.
 * Capacitor v8's push-notifications plugin exposes no way to write the badge
 * — `badge` is read-only on an incoming notification — and neither
 * local-notifications nor any installed plugin can set it either.
 * `removeAllDeliveredNotifications()` empties the notification list and leaves
 * the red number on the icon exactly where it was.
 *
 * The working path is server-side: APNs sets the badge, so send a push with an
 * accurate absolute `badge` (0 to clear). `send-apns-push` now forwards that
 * value through and omits the key entirely when unspecified, so a caller can
 * drive the badge from the real unread count in `notification-badge-context`
 * rather than the old hardcoded 1.
 *
 * To clear it locally instead, add `@capacitor/badge` and call it from here.
 */
export async function clearDeliveredNotifications(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Plugin not available
  }
}


