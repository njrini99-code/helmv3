'use client';

/**
 * DemoEnterTracker — fires once when a visitor arrives via the demo gate.
 *
 * The gate redirects to /golf/dashboard?demo=1.  This component detects that
 * param, fires posthog.capture(DEMO_ENTER_EVENT), then replaces the URL so the
 * param does not persist on subsequent navigation or refreshes.
 *
 * Mounted in the dashboard layout as a pure side-effect leaf (renders null).
 * Placement decision: the dashboard layout (src/app/golf/(dashboard)/layout.tsx)
 * is a server component that renders GolfDashboardShell (a client component).
 * Rather than converting the layout to a client component or adding state to
 * the shell, DemoEnterTracker is rendered as a sibling to {children} inside
 * GolfDashboardShell (see mounting instructions below).  If that proves
 * awkward during shell refactors, it can alternatively be placed in the
 * dashboard index page — the effect is identical since `?demo=1` only appears
 * on the initial landing URL.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { DEMO_ENTER_EVENT } from '@/lib/demo/config';

export function DemoEnterTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Persists across React Strict Mode's mount→unmount→remount effect double-run,
  // so the event fires exactly once even in development.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (searchParams.get('demo') !== '1') return;
    fired.current = true;

    // posthog-js is a no-op when not initialised (key absent / localhost),
    // so this call is always safe.
    posthog.capture(DEMO_ENTER_EVENT, {
      $set_once: { demo_first_seen: new Date().toISOString() },
    });

    // Clean the param from the URL so it doesn't appear in subsequent navigations
    const next = new URLSearchParams(searchParams.toString());
    next.delete('demo');
    const clean = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(clean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  return null;
}
