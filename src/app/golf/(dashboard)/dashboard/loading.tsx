import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayDashboardSkeleton } from '@/components/fairway/pages/dashboard/FairwayDashboardSkeleton';

/**
 * Route skeleton (P001). Shape-matched to FairwayCoachDashboard (max-w-[1200px],
 * hero strip, 2/4-up KPI grid, DataTable digest, 5-col team region) → no CLS /
 * wrong-chrome flash.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayDashboardSkeleton />
    </div>
  );
}
