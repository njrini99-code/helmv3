'use client';

/**
 * Pull-to-refresh for the golf feed screens (NAV-R3, MOT-19): Home, Rounds,
 * CoachHelm (the brief and triage) and Calendar. A pull re-runs the route's
 * server components with router.refresh(); the spinner holds until the
 * refreshed payload has rendered.
 *
 * Mounted once around the dashboard shell's content and always rendered, so
 * moving between routes toggles `disabled` instead of remounting the page.
 * Messages keeps its own PullToRefresh on its conversation list.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PullToRefresh } from '@/components/golf/PullToRefresh';

/** Exact paths that refresh on a pull. */
export const GOLF_PULL_TO_REFRESH_ROUTES: ReadonlySet<string> = new Set([
  '/golf/dashboard',
  '/golf/dashboard/rounds',
  '/golf/dashboard/coachhelm',
  '/golf/dashboard/calendar',
]);

export function GolfRouteRefresh({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const settle = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!isPending && settle.current) {
      settle.current();
      settle.current = null;
    }
  }, [isPending]);

  const onRefresh = React.useCallback(
    () =>
      new Promise<void>((resolve) => {
        // A refresh that never reports pending must not hold the spinner.
        const fallback = window.setTimeout(resolve, 8000);
        settle.current = () => {
          window.clearTimeout(fallback);
          resolve();
        };
        startTransition(() => router.refresh());
      }),
    [router],
  );

  return (
    <PullToRefresh scroll="document" onRefresh={onRefresh} disabled={!GOLF_PULL_TO_REFRESH_ROUTES.has(pathname)}>
      {children}
    </PullToRefresh>
  );
}
