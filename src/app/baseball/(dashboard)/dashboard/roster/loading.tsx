import { Header } from '@/components/layout/header';
import { SkeletonTable } from '@/components/ui/skeleton-loader';

export default function RosterLoading() {
  return (
    <>
      <Header title="Roster" subtitle="Loading..." />
      <div className="p-6 lg:p-8">
        {/* Toolbar skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <div className="h-10 bg-warm-200 rounded-lg animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-24 bg-warm-200 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-warm-200 rounded-lg animate-pulse" />
            <div className="h-10 w-32 bg-warm-200 rounded-lg animate-pulse" />
          </div>
        </div>

        {/* Table skeleton */}
        <SkeletonTable rows={8} columns={6} />
      </div>
    </>
  );
}
