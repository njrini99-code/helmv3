'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils/capacitor';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';

/**
 * Native-only bounce away from the marketing landing page.
 *
 * Before: always replaced to `to` (usually `/golf/login`) on iOS/Android.
 * That flashed the login screen even for already-authenticated returning
 * users before the login page's own auth check re-routed them to the
 * dashboard — 3-5 screens of transition for someone who's already in.
 *
 * Now: checks the Supabase session first and routes directly to the
 * welcome page (and on to the correct dashboard) when a user already
 * exists. Only truly-signed-out users see the login page.
 */
export function NativeRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    const supabase = createClient();

    // Always fall back to `to` on any error so a slow-cold-start or offline
    // native launch still lands on the sign-in screen instead of stranding
    // the user on the marketing landing page. The old one-liner redirect
    // couldn't fail; this async version must preserve that guarantee.
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;

        if (!user) {
          router.replace(to);
          return;
        }

        // Authed → skip the login flash. Look up role for admin routing.
        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;

        const isAdmin = (userRow?.role as string | undefined) === 'admin';
        const dest = resolveAdminPostLoginPath(isAdmin);
        router.replace(`/golf/welcome?next=${encodeURIComponent(dest)}`);
      } catch {
        // Network timeout, AbortError, or unexpected Supabase failure —
        // fall back to the caller's default so the native shell is never
        // stuck on the marketing page.
        if (!cancelled) router.replace(to);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, to]);

  return null;
}
