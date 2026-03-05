'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeApp } from '@/lib/utils/capacitor';
import { registerDeviceToken } from '@/app/golf/actions/push-notifications';

type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unknown';

interface UsePushNotificationsResult {
  permissionStatus: PermissionStatus;
  isRegistered: boolean;
  requestPermission: () => Promise<boolean>;
  token: string | null;
}

/**
 * Hook for managing push notifications via Capacitor.
 * Handles registration, permission requests, token storage, and notification events.
 * Only active in native Capacitor apps.
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const listenersAddedRef = useRef(false);

  // Check current permission status
  useEffect(() => {
    if (!isNativeApp()) return;

    const checkPermission = async () => {
      try {
        const status = await PushNotifications.checkPermissions();
        setPermissionStatus(status.receive as PermissionStatus);
      } catch {
        setPermissionStatus('unknown');
      }
    };

    checkPermission();
  }, []);

  // Set up listeners (once)
  useEffect(() => {
    if (!isNativeApp() || listenersAddedRef.current) return;
    listenersAddedRef.current = true;

    // Token received — store it
    PushNotifications.addListener('registration', async (tokenData) => {
      const deviceToken = tokenData.value;
      setToken(deviceToken);
      setIsRegistered(true);

      try {
        await registerDeviceToken(deviceToken, 'ios');
      } catch (err) {
        console.error('Failed to store device token:', err);
      }
    });

    // Registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
      setIsRegistered(false);
    });

    // Notification received in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // The notification is shown natively via presentationOptions in capacitor.config.ts
      console.log('Push received (foreground):', notification.title);
    });

    // Notification tapped — handle deep link
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.url && typeof window !== 'undefined') {
        // Navigate to the deep link URL
        window.location.href = data.url;
      }
    });

    return () => {
      PushNotifications.removeAllListeners();
      listenersAddedRef.current = false;
    };
  }, []);

  // Request permission and register
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNativeApp()) return false;

    try {
      const permission = await PushNotifications.requestPermissions();
      const granted = permission.receive === 'granted';
      setPermissionStatus(granted ? 'granted' : 'denied');

      if (granted) {
        await PushNotifications.register();
      }

      return granted;
    } catch (err) {
      console.error('Push permission request failed:', err);
      return false;
    }
  }, []);

  return {
    permissionStatus,
    isRegistered,
    requestPermission,
    token,
  };
}
