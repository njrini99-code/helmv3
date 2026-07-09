import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/stats.
 *
 * The fallback mirrors the live surface (FairwayPlayerStats → the shared
 * FairwayStatsCockpit), so the skeleton matches the real content's tokens,
 * width, and shape — no two-stage flash, no layout shift. Reproduces the
 * exact container chain (.fairway-ds · bg-canvas · mx-auto max-w-[1200px] ·
 * px-4 py-2 md:px-6) and a skeleton mirroring the cockpit's own StatsLoading
 * shape (hero · 4-up vitals · tabbed body).
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <div
          className="flex flex-col gap-10"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="sr-only">Loading stats…</span>
          {/* Masthead (eyebrow + title + description) — mirrors CoachHelmShell header */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16 rounded-fw-sm" />
            <Skeleton className="h-8 w-56 rounded-fw-sm" />
            <Skeleton className="h-4 w-80 max-w-full rounded-fw-sm" />
          </div>

          {/* 1 · VERDICT hero (SG: Total vs PGA) */}
          <Skeleton className="h-56 rounded-card" />

          {/* 2 · VITALS — 4-up */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>

          {/* Tabbed body */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-card" />
            <Skeleton className="h-72 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
