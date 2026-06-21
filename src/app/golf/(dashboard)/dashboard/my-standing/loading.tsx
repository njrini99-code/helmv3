import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the player My Standing view.
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless instead of flashing legacy chrome. Wrapped
 * in the same `fairwayScope('min-h-full bg-canvas')` frame + `max-w-[860px]` column
 * the page itself uses, and shape-matched: masthead (eyebrow / title / description)
 * → a couple of category sections, each a label + description over a 2-col grid of
 * StandingStrip cards.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[860px] px-4 py-2 md:px-6"
      >
        <span className="sr-only">Loading standing…</span>

        {/* Masthead — eyebrow / title / description */}
        <div className="flex flex-col gap-2 pt-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        {/* Category sections — label + description over a 2-col strip grid */}
        <div className="mt-8 flex flex-col gap-10">
          {Array.from({ length: 3 }).map((_, s) => (
            <section key={s} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 px-1">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} lines={2} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
