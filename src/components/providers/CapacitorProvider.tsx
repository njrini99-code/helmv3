'use client';

import { useEffect } from 'react';
import { initCapacitor, isNativeApp, hideSplashScreen, setStatusBarStyle } from '@/lib/utils/capacitor';
import { registerForPushNotifications } from '@/lib/utils/push-registration';

export function CapacitorProvider() {
  useEffect(() => {
    initCapacitor();

    if (isNativeApp()) {
      // Set status bar to dark content (dark text on light background)
      setStatusBarStyle('dark');

      // Hide splash screen once the first frame is painted
      const rafId = requestAnimationFrame(() => {
        hideSplashScreen();
      });

      // Register for push notifications (requests permission + saves token)
      registerForPushNotifications();

      return () => cancelAnimationFrame(rafId);
    }
    return undefined;
  }, []);

  return null;
}
