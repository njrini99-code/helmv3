import { Header } from '@/components/layout/header';

function CampCardSkeleton() {
  return (
    <div className="glass-standard rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <div className="h-5 w-2/3 bg-warm-200 rounded mb-2" />
          {/* Organization */}
          <div className="h-4 w-1/2 bg-warm-200 rounded mb-3" />
          {/* Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-warm-200 rounded" />
              <div className="h-3 w-24 bg-warm-200 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-warm-200 rounded" />
              <div className="h-3 w-20 bg-warm-200 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-warm-200 rounded" />
              <div className="h-3 w-28 bg-warm-200 rounded" />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-6 w-16 bg-warm-200 rounded-full" />
          <div className="h-6 w-12 bg-warm-200 rounded" />
        </div>
      </div>
      {/* Description */}
      <div className="mt-3 space-y-1.5">
        <div className="h-3 w-full bg-warm-100 rounded" />
        <div className="h-3 w-2/3 bg-warm-100 rounded" />
      </div>
      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-warm-100 flex justify-end gap-2">
        <div className="h-8 w-20 bg-warm-200 rounded-lg" />
        <div className="h-8 w-16 bg-warm-200 rounded-lg" />
      </div>
    </div>
  );
}

export default function CampsLoading() {
  return (
    <>
      <Header title="Camps" subtitle="Loading..." />
      <div className="p-6 lg:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CampCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
