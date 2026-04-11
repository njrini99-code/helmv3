'use client';

import { useEffect } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { initCapacitor, isNativeApp, hideSplashScreen, setStatusBarStyle } from '@/lib/utils/capacitor';
import { initPushListeners } from '@/lib/utils/push-registration';

export function CapacitorProvider() {
  useEffect(() => {
    initCapacitor();

    if (isNativeApp()) {
      // Tag the <body> so native-only CSS (iOS font, web-ism removals,
      // momentum scroll) can target `body.capacitor`.
      document.body.classList.add('capacitor', 'capacitor-ios');

      // Set status bar to dark content (dark text on light background)
      setStatusBarStyle('dark');

      // Hide splash screen once the login content has actually painted.
      // Double-rAF ensures layout + paint of the first frame are committed
      // before we fade the native splash — eliminates the brief white flash.
      let innerRaf = 0;
      const rafId = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => {
          hideSplashScreen();
        });
      });

      // Wire up push notification listeners WITHOUT prompting the user.
      // The actual permission prompt is gated behind a soft-ask BottomSheet
      // shown from the dashboard shell (see PushPermissionSoftAsk).
      initPushListeners();

      // Keyboard lifecycle — add body class + expose CSS variable so
      // layouts can reclaim space when the native keyboard opens.
      // This prevents the sign-in form from looking "sloppy" when the
      // keyboard pushes content around.
      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        document.body.classList.add('keyboard-open');
        document.documentElement.style.setProperty(
          '--keyboard-height',
          `${info.keyboardHeight}px`
        );
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open');
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });

      return () => {
        cancelAnimationFrame(rafId);
        if (innerRaf) cancelAnimationFrame(innerRaf);
        showListener.then((h) => h.remove()).catch(() => {});
        hideListener.then((h) => h.remove()).catch(() => {});
      };
    }
    return undefined;
  }, []);

  return null;
}
