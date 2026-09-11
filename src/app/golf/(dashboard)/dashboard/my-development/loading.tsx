import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/my-development`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` (my-development/page.tsx:1-23) is a pure `permanentRedirect` to
 * `/golf/dashboard/coachhelm?view=development` — Player Development is now
 * the `development` drill of the Player CoachHelm Spine & Stage home, not a
 * standalone route (`.claude/rules/golf-feature-ownership.md`:
 * "editing a shim does not change what any user sees"). `surface-registry.ts`
 * marks this entry `legacy: true, hidden: true`, and `next.config.mjs`
 * additionally intercepts this path at the framework routing layer before
 * this segment ever renders; the shim survives only because several action
 * files still call `revalidatePath('/golf/dashboard/my-development')`.
 *
 * This file previously drew a full masthead/tabs/goals/progress-instrument/
 * focus-area skeleton shape-matched to the standalone page that used to live
 * here — see the near-identical fix applied to the sibling shim at
 * `dashboard/alerts/loading.tsx` for the reasoning. Not deleted outright,
 * because deleting it would let the ancestor `dashboard/loading.tsx` claim
 * the segment instead, a larger fabrication than the one being removed.
 * `bg-canvas` alone keeps the warm ground continuous if the redirect is ever
 * slow enough to paint.
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
