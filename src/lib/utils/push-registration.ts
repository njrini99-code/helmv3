'use client';

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
 * Wire up push notification listeners without prompting for permission.
 * Safe to call on every app launch.
 */
export async function initPushListeners(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // If permission was previously granted, silently re-register with APNs
    // so the token stays fresh.
    const permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'granted') {
      await PushNotifications.register();
    }

    // Listen for the registration event (fires once per session with APNs token)
    PushNotifications.addListener('registration', async (token) => {
      const { registerDeviceToken } = await import('@/app/golf/actions/push-notifications');
      // The webview can fire `registration` before the Supabase session
      // cookie has propagated, so registerDeviceToken may return a retryable
      // Unauthorized result. Back off and retry a few times before giving up
      // — initPushListeners re-registers on the next launch regardless.
      const backoffsMs = [1000, 2000, 4000, 8000];
      let lastError: unknown;
      for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
        try {
          const result = await registerDeviceToken(token.value, 'ios');
          if (result.success) return;
          if (!result.retryable) {
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
      console.warn('[Push] Device token registration failed after retries; will retry on next launch', lastError);
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration failed:', error);
    });

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
    });

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
    });
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


