'use client';

import { useEffect } from 'react';
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
      let innerRaf = 0;
      const rafId = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => {
          hideSplashScreen();
        });
      });

      // Wire up push notification listeners WITHOUT prompting the user.
      initPushListeners();

      // Keyboard lifecycle — dynamic import to avoid "Keyboard plugin
      // is not implemented on web" errors. The static import was causing
      // unhandled rejections on every web page load. A `cancelled` flag
      // prevents listener leaks if the component unmounts before the
      // dynamic-import promise resolves (fast route-nav case).
      let cancelled = false;
      let cleanupKeyboard: (() => void) | undefined;
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        if (cancelled) return;
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
        cleanupKeyboard = () => {
          showListener.then((h) => h.remove()).catch(() => {});
          hideListener.then((h) => h.remove()).catch(() => {});
        };
      }).catch(() => {
        // Keyboard plugin not available — no-op on web
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
        if (innerRaf) cancelAnimationFrame(innerRaf);
        cleanupKeyboard?.();
      };
    }
    return undefined;
  }, []);

  return null;
}
