import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the player Team Hub (redesign-only route).
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless. Wrapped in the same
 * `fairwayScope('min-h-full bg-canvas')` frame the page uses, and shape-matched:
 * masthead → tab row → the consolidated section cards (tasks / announcements /
 * travel / classes).
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
        <span className="sr-only">Loading team hub…</span>

        {/* Masthead */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        {/* Tab row */}
        <div className="mt-6 flex items-center gap-2 border-b border-border-subtle pb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-20" />
          ))}
        </div>

        {/* Consolidated section cards */}
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      </div>
    </div>
  );
}
