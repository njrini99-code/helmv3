import { FairwayShellSkeleton } from '@/components/fairway/app-shell/FairwayShellSkeleton';
import { FairwayDashboardSkeleton } from '@/components/fairway/pages/dashboard/FairwayDashboardSkeleton';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { ClubhouseShellSkeleton } from '@/clubhouse/shell/ShellSkeleton';
import { HomeSkeleton } from '@/clubhouse/screens/home/HomeSkeleton';

/**
 * Loading UI for EVERYTHING under /golf that has no closer boundary.
 *
 * This is the boundary that covers the async `(dashboard)/layout.tsx` while it
 * resolves session → role → active team (a `loading.tsx` inside a segment sits
 * INSIDE that segment's layout, so `(dashboard)/loading.tsx` cannot cover its
 * own layout's await — only the parent segment's can). It therefore paints on
 * essentially every cold entry into GolfHelm.
 *
 * It used to render the legacy `GenericPageSkeleton`: no rail, no top bar,
 * `max-w-5xl`, warm/cream tokens. The result was a visible chrome swap on
 * every load — generic centered card stack, then the real Fairway shell, then
 * the page. Rendering the shell SILHOUETTE plus the same dashboard skeleton
 * that `(dashboard)/loading.tsx` shows next means the hand-off changes only
 * what is INSIDE the chrome, never the chrome itself.
 *
 * Blast radius: this also covers `/golf` (a redirect page), `/golf/admin/**`
 * while its own async layout resolves, and `/golf/(auth)/demo`. Every auth,
 * onboarding and join route has its own closer `loading.tsx` and is unaffected.
 * Admin gets dashboard-shaped content for a moment rather than admin-shaped —
 * strictly better than the retired cream skeleton it replaces, and admin is
 * internal-only.
 */
export default function GolfLoading() {
  // With Clubhouse on, the cold entry paints Clubhouse's frame, never Fairway's (swap audit F-30). The role is not
  // known above the dashboard layout; the flag is environment-wide and every dashboard role is coach or player.
  if (isFlagEnabled('golf_clubhouse_ui')) {
    return (
      <ClubhouseShellSkeleton>
        <HomeSkeleton />
      </ClubhouseShellSkeleton>
    );
  }
  return (
    <FairwayShellSkeleton>
      <FairwayDashboardSkeleton />
    </FairwayShellSkeleton>
  );
}
