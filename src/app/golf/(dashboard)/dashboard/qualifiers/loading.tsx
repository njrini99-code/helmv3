import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P324 — the Suspense fallback for the Qualifiers library must match the LIVE
 * Fairway layout, not the legacy cream/glass chrome. The previous skeleton used
 * `warm-*` / `cream-*` / `surface-matte` / `skeleton-shimmer` tokens, so the
 * load→content transition jumped from glass chrome to the bg-canvas matte
 * Fairway surfaces. This reserves the ACTUAL FairwayQualifiers layout:
 * a max-w-[1280px] shell with a ViewHeader-shaped title row + action, the
 * raised hero, the bare Toolbar line (search + status FilterPills over one
 * hairline), then ONE bordered Surface of seam rows under two section
 * headings — the live composition since the qualifiers facelift (no card
 * grid). Tokens only (bg-canvas, Surface/Skeleton primitives).
 *
 * Radius/height audit: the masthead action skeleton stands for the "Create
 * qualifier" Button (FairwayQualifiers.tsx:196, variant="primary", default
 * size="md"), which resolves to `rounded-full` + `min-h-[44px]` (button.tsx:94,
 * :161) — not `rounded-card` / h-10. The toolbar search skeleton stands for
 * SearchField (FairwayQualifiers.tsx:294, default size="md"), whose track is
 * `rounded-fw-sm` + `h-11` (search-field.tsx:75, :141) — Skeleton's own default
 * radius, so it takes no radius override, and h-11 not h-10.
 */
function FairwayQualifiersLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading qualifiers…</span>

        {/* ViewHeader-shaped title row + primary action */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-36 rounded-full" />
        </div>

        {/* Hero — soft-lit active/upcoming qualifier */}
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5 sm:col-span-2" />
              </div>
            </div>
          </Surface>
        </div>

        {/* Bare Toolbar — search + status pills on one line (phone: search,
            then pills) over a single hairline, like Toolbar frame="bare". */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
          <div className="min-w-0 basis-full sm:basis-auto sm:w-72">
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="flex items-center gap-2">
            {[14, 18, 24].map((w, i) => (
              <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
        </div>

        {/* ONE Surface: two seam sections (Active · Concluded) of rows. */}
        <div className="mt-6">
          <Surface elevation="border" padding="none" className="overflow-hidden">
            {[2, 2].map((rows, section) => (
              <div key={section} className={section > 0 ? 'border-t border-border-subtle' : undefined}>
                <div className="px-4 pt-4 pb-2">
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="divide-y divide-border-subtle border-t border-border-subtle">
                  {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex min-h-11 items-center gap-3 px-4 py-3 sm:gap-4">
                      <Skeleton className="h-5 flex-1" />
                      <Skeleton className="hidden h-4 w-36 sm:block" />
                      <Skeleton className="h-4 w-16 sm:hidden" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Surface>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayQualifiersLoading />;
}
