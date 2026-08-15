import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/analytics/coachhelm`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` here is a pure `permanentRedirect('/golf/dashboard/intelligence?view=effectiveness')`
 * shim. Effectiveness stopped being a standalone surface on 2026-07-19 (Spine &
 * Stage, plan Task 9): it is now the `effectiveness` drill of the coach
 * Intelligence home, and this path survives only because `drills.ts` still calls
 * `revalidatePath()` on it. `surface-registry.ts` marks the `effectiveness`
 * entry `legacy: true, hidden: true`. `next.config.mjs` (`redirects()`, the
 * `/golf/dashboard/analytics/coachhelm` source) additionally intercepts the URL
 * at the framework routing layer, before this segment renders at all.
 *
 * What this file used to be: a 120-line reconstruction of `FairwayEffectiveness`'s
 * instrument cockpit — a raised Readout+Ribbon hero, an Outcomes/Calibration
 * rail, a 3-up micro-readout row, the pattern-impact and error-mix decks, a "Go
 * deeper" row, a five-tab `CoachHelmSubNav` strip (the coach strip has had two
 * tabs, Brief + Ask, since that same 2026-07-19 change), and a REAL, non-skeleton
 * `<h1>Is CoachHelm helping?</h1>`. It was written against the surface this route
 * mounted before the redesign and was never revisited when the page became a
 * redirect. Every pixel of it was a promise about a page that no longer exists —
 * and the `<h1>` meant a screen reader could announce a heading for a surface
 * the user was in the act of being redirected away from.
 *
 * A skeleton's contract in this repo is to shape-match its page's real Fairway
 * first paint. This page's real first paint is nothing, so this fallback draws
 * nothing. It is not deleted, because deleting it would let the ancestor
 * `dashboard/loading.tsx` — a full `FairwayDashboardSkeleton` — claim the
 * segment instead, which is a larger fabrication than the one being removed.
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
