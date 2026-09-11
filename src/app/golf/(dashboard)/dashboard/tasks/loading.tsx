import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTasksSkeleton } from '@/components/fairway/pages/tasks/FairwayTasksSkeleton';

/**
 * P433 — purpose-built loading state for the Tasks board. Shape-matches the
 * page's own first paint: this Suspense fallback covers only the gap until
 * GolfTasksPage mounts, then that 'use client' page's OWN loading branch takes
 * over until useTaskRealtime resolves, so the board paints in place with no
 * layout swap / CLS.
 *
 * Facelift (docs/design/fairway-facelift/screens/tasks.v3.md): both states now
 * render the SAME FairwayTasksSkeleton — masthead, one Surface stage, the
 * ledger row, the table — instead of two hand-maintained copies of the retired
 * StatMatrix + Toolbar + seam-row shape.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayTasksSkeleton />
    </div>
  );
}
