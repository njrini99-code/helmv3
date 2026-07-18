import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayDashboardSkeleton } from '@/components/fairway/pages/dashboard/FairwayDashboardSkeleton';

/**
 * Loading UI for the golf dashboard layout (initial navigation into any
 * /golf/dashboard route while the layout resolves session/role/team).
 *
 * Renders the SAME shape as dashboard/loading.tsx rather than the generic
 * DashboardSkeleton: the entry chain otherwise painted two differently-shaped
 * skeletons back-to-back (generic → dashboard-shaped) on a single navigation —
 * one visible "shell swap" for no information gain. Sub-routes with their own
 * loading.tsx still override this on direct navigation.
 */
export default function GolfDashboardLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayDashboardSkeleton />
    </div>
  );
}
