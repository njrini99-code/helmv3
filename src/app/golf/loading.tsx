import { ClubhouseShellSkeleton } from '@/clubhouse/shell/ShellSkeleton';
import { BootSkeleton } from '@/clubhouse/shell/BootSkeleton';

/**
 * Loading UI for EVERYTHING under /golf that has no closer boundary.
 *
 * This is the boundary that covers the async `(dashboard)/layout.tsx` while it
 * resolves session → role → active team (a `loading.tsx` inside a segment sits
 * INSIDE that segment's layout, so `(dashboard)/loading.tsx` cannot cover its
 * own layout's await — only the parent segment's can). It therefore paints on
 * essentially every cold entry into GolfHelm.
 *
 * It paints the Clubhouse shell silhouette and the boot skeleton, so the
 * hand-off to the real shell changes only what is INSIDE the chrome, never the
 * chrome itself (swap audit F-30). Clubhouse is the only coach and player UI
 * (Fairway retired, owner 2026-11-14), so there is no other frame to choose.
 *
 * Blast radius: this also covers `/golf` (a redirect page), `/golf/admin/**`
 * while its own async layout resolves, and `/golf/(auth)/demo`. A route's own
 * `loading.tsx` sits inside that route's layout, so it does not cover an async
 * layout: a layout that awaits (welcome's) paints this skeleton on a client
 * navigation. The Clubhouse sign in reads nothing from the request for that
 * reason (`ClubhouseSignInRoute`).
 */
export default function GolfLoading() {
  // `data-ch-boot-skeleton`: a hard load of the Clubhouse sign in hides this fallback until its own markup is swapped
  // in (SkyScript's front-door boot), so it never opens on a dashboard skeleton.
  return (
    <div data-ch-boot-skeleton="" style={{ display: 'contents' }}>
      <ClubhouseShellSkeleton>
        <BootSkeleton />
      </ClubhouseShellSkeleton>
    </div>
  );
}
