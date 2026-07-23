import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the SectionMasthead this route now renders above StrengthGroupsClient
// (spec: docs/baseball/design-system-living-annual.md §7) so the masthead
// doesn't pop in after the board. StrengthGroupsClient's own root is a
// strict two-pane layout — an `lg:w-64` group-list aside + a flex-1 detail
// pane (the "Add athletes" panel renders inline inside that same pane, not
// as a separate rail) — so this reproduces exactly those two regions, not
// a third column with no corresponding real UI.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-2 h-9 w-56" />
        <Skeleton className="mt-3 h-[3px] w-16 rounded-full" />
      </div>
      <div className="flex flex-col gap-4 lg:h-full lg:min-h-[600px] lg:flex-row">
        <div className="space-y-2 lg:w-64 lg:shrink-0">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 flex-1 rounded-2xl" />
      </div>
    </div>
  );
}
