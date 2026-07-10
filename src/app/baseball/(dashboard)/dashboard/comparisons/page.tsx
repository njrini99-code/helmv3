// =============================================================================
// SavedComparisonsPage — the coach's saved-comparisons list, migrated onto
// "The Living Annual" kit (Lane 2 · THE WAR ROOM, clay ink — a sibling of
// /compare, spec §6 P3 #10). PRESENTATION ONLY: `requireRecruitingCoachRoute`
// (W0 server guard) and `getSavedComparisons` are unchanged; only the page
// chrome (masthead, error state, skeleton) moved to the kit — matching
// /compare's sibling behavior instead of a raw red error string.
// =============================================================================
import { Suspense } from 'react';
import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import { getSavedComparisons } from '../compare/actions';
import { SavedComparisonsList } from '@/components/features/saved-comparisons-list';
import { SectionMasthead, PaperCard, EditorsLetter } from '@/components/baseball/living-annual';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SHELL = 'mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6';

export default async function SavedComparisonsPage() {
  // SECURITY: previously relied on getSavedComparisons()'s internal
  // { error: 'Unauthorized' } string, which just rendered as an inline error
  // banner (no redirect) — the page shell still rendered for an unauthorized
  // caller. Match the sibling /compare route's guard instead.
  await requireRecruitingCoachRoute();

  const { comparisons, error } = await getSavedComparisons();

  return (
    <div className={PAGE_SHELL}>
      <SectionMasthead eyebrow="THE WAR ROOM · DECISION ROOM" title="Saved Comparisons" ink="pursuit">
        <p className="max-w-prose font-annual text-body-sm text-text-secondary">
          View and manage your saved player comparisons.
        </p>
      </SectionMasthead>

      {/* Error State */}
      {error && (
        <div className="mt-6">
          <EditorsLetter ink="pursuit" title="Couldn't load your comparisons" body={error} />
        </div>
      )}

      {/* Comparisons List */}
      <div className="mt-6">
        <Suspense fallback={<ComparisonsLoadingSkeleton />}>
          <SavedComparisonsList comparisons={comparisons} />
        </Suspense>
      </div>
    </div>
  );
}

function ComparisonsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <PaperCard key={i} className="p-6">
          <Skeleton variant="text" width="75%" height={16} className="mb-3" />
          <Skeleton variant="text" width="50%" height={12} className="mb-4" />
          <div className="space-y-2">
            <Skeleton variant="text" width="100%" height={12} />
            <Skeleton variant="text" width="85%" height={12} />
          </div>
        </PaperCard>
      ))}
    </div>
  );
}
