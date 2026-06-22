import { DashboardSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayDashboardSkeleton } from '@/components/fairway/pages/dashboard/FairwayDashboardSkeleton';

/**
 * Route skeleton (P001). Flag-forked so the placeholder matches the chrome the
 * page actually paints:
 *   • Redesign ON  → FairwayDashboardSkeleton inside the `.fairway-ds` scope on
 *     bg-canvas, shape-matched to FairwayCoachDashboard (max-w-[1200px], hero
 *     strip, 2/4-up KPI grid, DataTable digest, 5-col team region) → no CLS /
 *     wrong-chrome flash.
 *   • Redesign OFF → the legacy DashboardSkeleton EXACTLY as before.
 */
export default function Loading() {
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayDashboardSkeleton />
      </div>
    );
  }
  return <DashboardSkeleton />;
}
