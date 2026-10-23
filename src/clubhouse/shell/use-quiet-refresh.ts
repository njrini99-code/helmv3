'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';

/** Away this long, the page on screen is old enough to fetch again when it comes back. */
export const QUIET_REFRESH_AWAY_MS = 60_000;
/** A connection that flaps refreshes once, after it has held this long. */
export const QUIET_REFRESH_ONLINE_MS = 2_000;

/** A round being scored: its screen keeps its own state and saves as it goes, so a refresh under it is never wanted. */
const SCORING = /^\/golf\/dashboard\/rounds\/(new|continue\/[^/]+)\/?$/;

/** Someone is in the middle of something: a dialog is open or a field has focus, so a refresh could cost what they typed. */
function busy(pathname: string): boolean {
  if (SCORING.test(pathname)) return true;
  if (document.querySelector('dialog[open], [role="dialog"]:not([aria-hidden="true"]), [role="alertdialog"]:not([aria-hidden="true"])')) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.matches('input, textarea, select') || el.isContentEditable);
}

/**
 * A17: the page quietly fetches again when the app comes back after a minute away (a tab shown again, the iPhone app
 * brought to the front) and once when the connection returns, so a coach opening the app in the morning sees today's
 * Home, not last night's. No spinner: the page on screen stays until the new render lands. Skipped while a dialog is
 * open, a field has focus or a round is being scored. Mounted once, in ClubhouseFrame.
 */
export function useQuietRefresh(pathname: string) {
  const router = useRouter();
  const live = useRef({ router, pathname });
  live.current = { router, pathname };

  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    let online: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (busy(live.current.pathname)) return;
      startTransition(() => live.current.router.refresh());
    };
    const away = () => {
      hiddenAt ??= Date.now();
    };
    const back = () => {
      const since = hiddenAt;
      hiddenAt = null;
      if (since !== null && Date.now() - since > QUIET_REFRESH_AWAY_MS) refresh();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? away() : back());
    const onOnline = () => {
      if (online) clearTimeout(online);
      online = setTimeout(() => {
        online = null;
        refresh();
      }, QUIET_REFRESH_ONLINE_MS);
    };
    const onOffline = () => {
      if (online) clearTimeout(online);
      online = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // The iPhone app: WKWebView does not always report visibility when the app goes to the background, so the app's own
    // state is heard too. Both may fire for one return; the first clears `hiddenAt`, so it refreshes once.
    let cancelled = false;
    let remove: (() => void) | undefined;
    if (isNativeApp()) {
      void import('@capacitor/app')
        .then(async ({ App }) => {
          if (cancelled) return;
          const handle = await App.addListener('appStateChange', ({ isActive }) => (isActive ? back() : away()));
          remove = () => void handle.remove();
          if (cancelled) remove();
        })
        .catch(() => {
          // No App plugin in this build: visibility alone.
        });
    }

    return () => {
      cancelled = true;
      remove?.();
      if (online) clearTimeout(online);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
}
