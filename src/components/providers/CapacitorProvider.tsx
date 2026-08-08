'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { initCapacitor, isNativeApp, hideSplashScreen, syncStatusBarToTheme } from '@/lib/utils/capacitor';
import { createClient } from '@/lib/supabase/client';
import {
  initPushListeners,
  flushPendingDeviceToken,
  PUSH_NAVIGATE_EVENT,
  PUSH_RECEIVED_EVENT,
  type PushNavigateDetail,
  type PushReceivedDetail,
} from '@/lib/utils/push-registration';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';

export function CapacitorProvider() {
  const router = useRouter();

  /**
   * Bridge the push listeners (plain module, registered once at boot) to the
   * Next router and the toast stack, which only exist inside React.
   *
   * Calling preventDefault() tells the emitter a listener handled the event,
   * so it skips its `window.location.href` fallback and we keep the SPA alive
   * instead of cold-starting it on every notification tap.
   */
  useEffect(() => {
    if (!isNativeApp()) return undefined;

    const onNavigate = (event: Event) => {
      const { url } = (event as CustomEvent<PushNavigateDetail>).detail;
      event.preventDefault();
      router.push(url);
    };

    const onReceived = (event: Event) => {
      const { title, body, data } = (event as CustomEvent<PushReceivedDetail>).detail;
      event.preventDefault();
      const url = typeof data.url === 'string' ? data.url : null;
      fairwayToast(title || 'New notification', {
        description: body || undefined,
        ...(url ? { action: { label: 'View', onClick: () => router.push(url) } } : {}),
      });
    };

    window.addEventListener(PUSH_NAVIGATE_EVENT, onNavigate);
    window.addEventListener(PUSH_RECEIVED_EVENT, onReceived);
    return () => {
      window.removeEventListener(PUSH_NAVIGATE_EVENT, onNavigate);
      window.removeEventListener(PUSH_RECEIVED_EVENT, onReceived);
    };
  }, [router]);

  useEffect(() => {
    initCapacitor();

    if (isNativeApp()) {
      // Tag the <body> so native-only CSS (iOS font, web-ism removals,
      // momentum scroll) can target `body.capacitor`.
      // The platform class was hardcoded to `capacitor-ios` because iOS was the
      // only shell. That becomes a lie on Android: every `body.capacitor-ios`
      // rule would apply there too, and no Android-specific rule could ever
      // match. Read the real platform instead.
      document.body.classList.add('capacitor', `capacitor-${Capacitor.getPlatform()}`);

      // Match the status bar to the active theme, then keep it matched.
      // `useGolfTheme` toggles `.dark` on <html> for an explicit choice, an OS
      // `prefers-color-scheme` change under `system`, and a cross-tab sync —
      // observing the class covers all three without duplicating that logic.
      void syncStatusBarToTheme();
      const themeObserver = new MutationObserver(() => {
        void syncStatusBarToTheme();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      // Hide splash screen once the login content has actually painted.
      let innerRaf = 0;
      const rafId = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => {
          hideSplashScreen();
        });
      });

      // Wire up push notification listeners WITHOUT prompting the user.
      initPushListeners();

      // APNs hands us the device token once per launch — on a cold start that
      // happens while the app is still on the login screen, so there is no
      // session to attach it to and the token sits parked. Finish the handshake
      // the moment one exists, otherwise the device registers no token at all
      // for the whole launch and silently receives no push (6 of 7 attempts in
      // the week to 2026-08-06).
      const authClient = createClient();
      const { data: { subscription: authSub } } = authClient.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
          void flushPendingDeviceToken();
        }
      });
      const pushAuthUnsubscribe = () => authSub.unsubscribe();

      // Keyboard lifecycle — dynamic import to avoid "Keyboard plugin
      // is not implemented on web" errors. The static import was causing
      // unhandled rejections on every web page load. A `cancelled` flag
      // prevents listener leaks if the component unmounts before the
      // dynamic-import promise resolves (fast route-nav case).
      let cancelled = false;
      let cleanupKeyboard: (() => void) | undefined;
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        if (cancelled) return;
        // Guard against a native build where the JS dependency is present
        // (package.json) but the plugin was never registered on the native
        // platform project (e.g. missing from android/capacitor.settings.gradle
        // autolinking). Without this check, addListener() below still fires;
        // its returned promise rejects ASYNCHRONOUSLY with "plugin is not
        // implemented", and since nothing awaits or catches it until unmount,
        // that rejection reaches the global unhandled-rejection handler and
        // pollutes the error feed on every load — this was the "Keyboard
        // plugin is not implemented on android" incident.
        if (!Capacitor.isPluginAvailable('Keyboard')) return;
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
        // addListener() rejects asynchronously, not synchronously, so a
        // try/catch around this block would not have caught it anyway.
        // Attach no-op catches immediately so a rejection is never left
        // unhandled between now and unmount (independent of the cleanup
        // handlers below, which only run then).
        showListener.catch(() => {});
        hideListener.catch(() => {});
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
        themeObserver.disconnect();
        cleanupKeyboard?.();
        pushAuthUnsubscribe();
      };
    }
    return undefined;
  }, []);

  return null;
}
