'use client';

/**
 * ============================================================================
 * Fairway · feedback · GenericPageSkeleton (Wave W1 — golf legacy-tree deletion)
 * ----------------------------------------------------------------------------
 * Fairway-tokened counterpart to the legacy `@/components/ui/skeleton`
 * `GenericPageSkeleton` — the fallback loading.tsx uses for routes that don't
 * (yet) have a page-shape-matched skeleton. Same anatomy (title row + one
 * action slot + a handful of stacked card rows), Fairway skin (`bg-canvas`,
 * `Skeleton`/`SkeletonCard` primitives) so the loading→content swap never
 * flashes legacy `warm-*`/`surface-matte`/`skeleton-shimmer` chrome.
 * ========================================================================== */

import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from './Skeleton';
import { SkeletonCard } from './Skeleton';

export function FairwayGenericPageSkeleton() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 md:py-8"
      >
        <span className="sr-only">Loading…</span>

        <div className="mb-2 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-32 rounded-card" />
        </div>

        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
