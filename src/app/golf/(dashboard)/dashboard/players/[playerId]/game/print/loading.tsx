import { FairwayGenericPageSkeleton } from '@/components/fairway';

/**
 * Route Suspense fallback for /golf/dashboard/players/[playerId]/game/print.
 *
 * The print scouting report is a bespoke, non-Fairway B&W-friendly document
 * (see page.tsx — it renders its own `print-shell` + `warm-*` typography, not
 * a Fairway page component), so a heavily shape-matched fallback would need
 * to invent chrome the real page doesn't have. A simple neutral Fairway frame
 * is enough here — it just needs to stop being the legacy `DetailPageSkeleton`
 * (bg-warm-200/60, surface-matte, rounded-3xl).
 */
export default function PrintLoading() {
  return <FairwayGenericPageSkeleton />;
}
