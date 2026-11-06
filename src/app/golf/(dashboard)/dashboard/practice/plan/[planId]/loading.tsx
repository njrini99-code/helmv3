import { PlanSheetSkeleton } from '@/clubhouse/screens/coachhelm/plan/sheet/PlanSheetSkeleton';

export default function Loading() {
  return (
    <main className="ch-page ch-prc-planpage" data-ch="practice-plan" aria-busy="true">
      <PlanSheetSkeleton />
    </main>
  );
}
