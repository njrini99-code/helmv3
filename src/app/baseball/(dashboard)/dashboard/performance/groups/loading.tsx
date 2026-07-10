import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the SectionMasthead this route now renders above StrengthGroupsClient
// (spec: docs/baseball/design-system-living-annual.md §7) so the masthead
// doesn't pop in after the board.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-2 h-9 w-56" />
        <Skeleton className="mt-3 h-[3px] w-16 rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
