import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/alerts`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` here is now a pure `permanentRedirect` shim (Spine & Stage,
 * plan Task 9, 2026-07-20, commit c9dc18e86): Alerts stopped being a
 * standalone surface and is the `alerts` filter of the consolidated Signals
 * drill on the coach Intelligence home (`.claude/rules/
 * golf-feature-ownership.md` — "editing a shim does not change what any
 * user sees"). `surface-registry.ts` marks this entry `legacy: true,
 * hidden: true`, and `next.config.mjs` (`redirects()`, the
 * `/golf/dashboard/alerts` source) additionally intercepts the URL at the
 * framework routing layer before this segment ever renders. Several action
 * files (`alerts.ts`, `insight-management.ts`, `intelligence-dashboard.ts`,
 * `development.ts`, `coaching-philosophy.ts`) still call
 * `revalidatePath('/golf/dashboard/alerts')`, which is why the route stays
 * live as a shim at all.
 *
 * This file used to draw a full Signals workspace fallback (3 MetricCard
 * tiles + toolbar + hero InsightCard + compact rows, plus a real static
 * "Signals" `<h1>`) written when `/alerts` was still `FairwayCoachHelmSignals`
 * itself (#947). That page was consolidated away in the redesign above and
 * this fallback was never revisited, so it kept reserving and announcing
 * (via its `<h1>`) a screen that no longer mounts here — see
 * `dashboard/analytics/coachhelm/loading.tsx` for the same fix applied to
 * the sibling shim this route was consolidated alongside.
 *
 * Not deleted, because deleting it would let the ancestor
 * `dashboard/loading.tsx` — a full `FairwayDashboardSkeleton` — claim the
 * segment instead, which is a larger fabrication than the one being
 * removed. `bg-canvas` alone keeps the warm ground continuous if the
 * redirect is ever slow enough to paint.
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
