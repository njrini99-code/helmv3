import { DataTableSkeleton, Skeleton } from '@/components/fairway';

/**
 * Route fallback shaped like the page: breadcrumb, title row with an action, then the six-column sessions table (STATE-X1).
 */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="min-h-screen bg-canvas p-6 md:p-10">
      <Skeleton className="mb-8 h-4 w-48" />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-fw-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-36 rounded-fw-md" />
      </div>
      <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
        <table className="w-full text-sm">
          <tbody>
            <DataTableSkeleton columns={6} rows={6} />
          </tbody>
        </table>
      </div>
    </main>
  );
}
