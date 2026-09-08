import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for `/golf/dashboard/development`.
 *
 * DELIBERATELY EMPTY — this route renders nothing. `page.tsx:1-38` here is a
 * pure `permanentRedirect` shim (`DevelopmentRedirect`, comment dated
 * 2026-07-19): Development Plans is now the `players` drill of the coach
 * Intelligence home (`/golf/dashboard/intelligence?view=players`), and
 * `next.config.mjs` additionally intercepts this path at the framework
 * routing layer before this segment ever renders. The route stays live only
 * because `development.ts`/`v3/goals.ts` still call
 * `revalidatePath('/golf/dashboard/development')`.
 *
 * This file previously rendered `PlayersGridSkeleton` — a full masthead +
 * segmented + DataTable-shaped roster fallback for a page that no longer
 * mounts at this segment (t=0 here is an immediate server redirect, not
 * `PlayersGridView`) — the same over-fabrication already fixed on the
 * sibling shim at `dashboard/alerts/loading.tsx:1-48`, which this mirrors.
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
