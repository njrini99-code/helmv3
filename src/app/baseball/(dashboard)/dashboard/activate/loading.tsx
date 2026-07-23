import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for /baseball/dashboard/activate. Mirrors
 * ActivateRecruitingFairway's real first viewport — the `fairwayScope`
 * canvas + `max-w-3xl` shell, a SectionMasthead (eyebrow + title + accent
 * rule), the hero pitch card, the 2-up feature grid, the privacy card, and
 * the CTA card — instead of a full-bleed bordered header bar + a
 * `max-w-[720px]` column that don't exist anywhere in the real page.
 */
export default function ActivateLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* SectionMasthead — eyebrow + title + accent rule */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-[3px] w-16 rounded-full" />
        </div>

        {/* Hero pitch card */}
        <div className="mt-6">
          <PaperCard registrationTick className="px-7 py-10 text-center sm:px-10" grain={false}>
            <Skeleton className="mx-auto mb-5 h-14 w-14 rounded-full" />
            <Skeleton className="mx-auto h-7 w-64" />
            <Skeleton className="mx-auto mt-3 h-4 w-full max-w-lg" />
            <Skeleton className="mx-auto mt-2 h-4 w-3/4 max-w-lg" />
            <Skeleton className="mx-auto mt-5 h-6 w-56 rounded-full" />
          </PaperCard>
        </div>

        {/* Benefit grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PaperCard key={i} className="h-full px-6 py-6" grain={false}>
              <Skeleton className="mb-3 h-10 w-10 rounded-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-1 h-4 w-full" />
              <div className="mt-4 space-y-2">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-3.5 w-4/5" />
                ))}
              </div>
            </PaperCard>
          ))}
        </div>

        {/* Privacy & control card */}
        <div className="mt-6">
          <PaperCard className="px-7 py-7" grain={false}>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="my-4 h-[1.5px] w-full" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-3.5 w-4/5" />
                ))}
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-3.5 w-4/5" />
                ))}
              </div>
            </div>
          </PaperCard>
        </div>

        {/* CTA card */}
        <div className="mt-6">
          <PaperCard className="px-7 py-10 text-center" grain={false}>
            <Skeleton className="mx-auto h-11 w-48 rounded-xl" />
            <Skeleton className="mx-auto mt-4 h-4 w-72" />
          </PaperCard>
        </div>
      </div>
    </div>
  );
}
