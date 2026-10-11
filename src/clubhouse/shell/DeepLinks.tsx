'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { currentPath, deepLinkPath } from '../lib/deep-link';

/** Read once per launch: a cold start from a link hands the app its URL here rather than (only) as an event. */
const LAUNCH_SEEN = 'ch-deeplink-launch-seen';

/**
 * In-app routing for universal links (P001-C2). The iOS app opens a tapped helmsportslabs.com link through
 * `appUrlOpen` (warm) or `getLaunchUrl` (cold); either becomes a client navigation, so the app stays alive and the
 * page's own Back leads to its parent (D-41). Nothing on the web. The AASA paths and entitlements are native (wave 2).
 */
export function DeepLinks() {
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const go = (raw: string | null | undefined) => {
      const path = deepLinkPath(raw, window.location.origin);
      if (!path || path === currentPath(window.location)) return;
      router.push(path);
    };
    void import('@capacitor/app')
      .then(async ({ App }) => {
        if (cancelled) return;
        const handle = await App.addListener('appUrlOpen', (e) => go(e.url));
        remove = () => void handle.remove();
        if (cancelled) return remove();
        let seen = false;
        try {
          seen = sessionStorage.getItem(LAUNCH_SEEN) === '1';
          sessionStorage.setItem(LAUNCH_SEEN, '1');
        } catch {
          // Storage off: read the launch URL anyway; a link to the open screen is a no-op.
        }
        if (!seen) go((await App.getLaunchUrl())?.url);
      })
      .catch(() => {
        // The App plugin isn't in this build: links open the app at its start page, as before.
      });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);
  return null;
}
