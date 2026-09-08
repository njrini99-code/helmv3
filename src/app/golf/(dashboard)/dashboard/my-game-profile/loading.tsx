import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/my-game-profile`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` here (my-game-profile/page.tsx:1-20) is a pure
 * `permanentRedirect` shim: My Game Profile stopped being a standalone
 * surface and is now the `profile` drill of the Player CoachHelm Spine &
 * Stage home (`.claude/rules/golf-feature-ownership.md` — "My Game Profile"
 * → `…/coachhelm?view=profile`). `surface-registry.ts`'s
 * `my-game-profile-tab` entry is `legacy: true, hidden: true`, and
 * `next.config.mjs` (`redirects()`) additionally intercepts this path at
 * the framework routing layer before this segment ever renders.
 *
 * This file previously drew a full FairwayMyGameProfile fallback (ViewHeader
 * + genome radar hero + persona chip rows + an 8-tile dimension grid) shaped
 * for a page that no longer mounts at this route — see
 * `dashboard/alerts/loading.tsx` for the same fix applied to the sibling
 * shim this route was consolidated alongside.
 *
 * Not deleted, because deleting it would let the ancestor
 * `dashboard/loading.tsx` claim the segment instead, which is a larger
 * fabrication than the one being removed. `bg-canvas` alone keeps the warm
 * ground continuous if the redirect is ever slow enough to paint.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope('min-h-full bg-canvas')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Redirecting…</span>
    </div>
  );
}
