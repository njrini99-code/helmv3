'use client';

import { isNativeApp } from './capacitor';

/**
 * Register for push notifications on iOS via Capacitor.
 * Call this AFTER the user has logged in and the app has loaded.
 *
 * Flow:
 * 1. Request notification permissions
 * 2. Register with APNs
 * 3. Listen for token, then save it to Supabase via server action
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Check current permission status
    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
      const result = await PushNotifications.requestPermissions();
      if (result.receive !== 'granted') {
        return; // User declined — respect their choice
      }
    } else if (permStatus.receive !== 'granted') {
      return; // Previously denied
    }

    // Register with APNs to get a device token
    await PushNotifications.register();

    // Listen for the registration event (fires once with the APNs token)
    PushNotifications.addListener('registration', async (token) => {
      try {
        const { registerDeviceToken } = await import('@/app/golf/actions/push-notifications');
        await registerDeviceToken(token.value, 'ios');
      } catch (err) {
        console.error('[Push] Failed to save device token:', err);
      }
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[Push] Registration failed:', error);
    });

    // Listen for received notifications (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // Notification received while app is in foreground
      // The Capacitor config already handles badge/sound/alert presentation
      console.log('[Push] Received in foreground:', notification.title);
    });

    // Listen for notification tap (background/killed → user opened via notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.url && typeof window !== 'undefined') {
        // Navigate to the deep link URL
        window.location.href = data.url;
      }
    });
  } catch (err) {
    console.error('[Push] Setup failed:', err);
  }
}

/**
 * Unregister push notifications (call on logout).
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
  } catch {
    // Plugin not available
  }
}
