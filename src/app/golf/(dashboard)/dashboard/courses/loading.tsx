import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the cloud Course Library.
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless instead of flashing legacy chrome. Wrapped
 * in the same `fairwayScope('min-h-full bg-canvas')` frame the page itself uses, and
 * shape-matched to the page: masthead → toolbar row → a course-card grid.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-6 sm:px-6 lg:px-8"
      >
        <span className="sr-only">Loading courses…</span>

        {/* Masthead */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        {/* Search + filter toolbar row */}
        <div className="mt-8 flex items-center gap-3">
          <Skeleton className="h-10 w-full max-w-sm rounded-fw-md" />
          <Skeleton className="h-10 w-28 rounded-fw-md" />
        </div>

        {/* Course-card grid */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} withMedia lines={2} />
          ))}
        </div>
      </div>
    </div>
  );
}
