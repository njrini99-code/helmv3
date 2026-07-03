'use client';

import { isNativeApp } from './capacitor';

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
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Received in foreground:', notification.title);
    });

    // Tap handler — deep-link via the URL in the notification payload
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      }
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
 * Clear the iOS app icon badge count. Call when the user reads all notifications.
 */
export async function clearPushBadge(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllDeliveredNotifications();
  } catch {
    // Plugin not available
  }
}


