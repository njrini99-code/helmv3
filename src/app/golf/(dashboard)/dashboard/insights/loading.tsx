import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/insights`.
 *
 * DELIBERATELY EMPTY — this route renders nothing.
 *
 * `page.tsx` (`InsightsRedirect`, page.tsx:29-46) is a pure
 * `permanentRedirect` shim: it only `await`s `searchParams` and calls
 * `permanentRedirect('/golf/dashboard/intelligence?...')`, returning
 * `Promise<never>` — it renders zero DOM. Insights stopped being a
 * standalone surface and is now the `insights` filter of the consolidated
 * Signals drill on the coach Intelligence home (`surface-registry.ts`:
 * `legacy: true, hidden: true`). `next.config.mjs` `redirects()`
 * (source `/golf/dashboard/insights`, next.config.mjs:312-313)
 * additionally intercepts the URL at the framework routing layer before
 * this segment ever renders. Several action files (`insight-management.ts`,
 * `intelligence-dashboard.ts`, `insight-celebration.ts`, `insights.ts`,
 * `development.ts`, `coaching-philosophy.ts`) still call
 * `revalidatePath('/golf/dashboard/insights')`, which is why the route
 * stays live as a shim at all.
 *
 * This file previously reserved the entire `CoachIntelligenceHome` layout
 * (composer + TeamCategoryLeakBand + BriefBand + ViewSwitch + diagnostics +
 * TeamSignalSummary + SignalQueue/SignalDossier — effectively
 * `intelligence/loading.tsx` copy-pasted here) on the theory that the
 * redirect target's structure doesn't change with `filter=insights`. But
 * `page.tsx` itself never renders that structure — mirroring the
 * destination's shape reserves geometry for a screen this segment does not
 * mount, which is exactly the CLS this fallback exists to prevent, just
 * moved one hop earlier. `alerts/loading.tsx` is the identical
 * pure-redirect-shim case (same `permanentRedirect` pattern, same
 * `intelligence` destination) already fixed to near-empty — this mirrors
 * that file rather than `intelligence/loading.tsx`.
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
