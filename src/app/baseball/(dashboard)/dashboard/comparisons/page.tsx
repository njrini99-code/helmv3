import { Suspense } from 'react';
import { getSavedComparisons } from '../compare/actions';
import { SavedComparisonsList } from '@/components/features/saved-comparisons-list';
import { IconBookmark, IconLayoutGrid } from '@/components/icons';

export default async function SavedComparisonsPage() {
  const { comparisons, error } = await getSavedComparisons();

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-green-50">
                <IconBookmark size={24} className="text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Saved Comparisons</h1>
            </div>
            <p className="text-slate-500">
              View and manage your saved player comparisons
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm leading-relaxed text-red-800">{error}</p>
          </div>
        )}

        {/* Comparisons List */}
        <Suspense fallback={<ComparisonsLoadingSkeleton />}>
          <SavedComparisonsList comparisons={comparisons} />
        </Suspense>
      </div>
    </div>
  );
}

function ComparisonsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse"
        >
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-3" />
          <div className="h-3 bg-slate-200 rounded w-1/2 mb-4" />
          <div className="space-y-2">
            <div className="h-3 bg-slate-200 rounded w-full" />
            <div className="h-3 bg-slate-200 rounded w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
