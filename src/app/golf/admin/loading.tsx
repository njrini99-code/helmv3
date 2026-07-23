import { Skeleton, StatSkeleton, CardSkeleton } from './components/AdminErrorBoundary';
import { cn } from '@/lib/utils';

/**
 * Route-level Suspense fallback for /golf/admin. Reproduces the persistent
 * dark 260px sidebar rail + sticky glass header that page.tsx itself renders
 * (there is no chrome in admin/layout.tsx — it's a pure auth wrapper), plus
 * the same 4-stat / 3-card grid page.tsx's own in-page `loading` branch
 * already uses (via `StatSkeleton` / `CardSkeleton` from `AdminErrorBoundary`)
 * — so the whole admin shell never pops in abruptly on mount.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh bg-[#FFFEF8] flex overflow-x-hidden" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading admin dashboard…</span>

      {/* Sidebar rail — desktop only, matches the real fixed dark aside */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-50 w-[260px]',
          'flex flex-col bg-[#1C1917] border-r border-white/5',
          'hidden lg:flex',
        )}
      >
        <div className="flex items-center h-16 border-b border-white/10 px-4 gap-3">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-14 rounded-full" />
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content — margin matches the expanded (260px) sidebar state */}
      <main className="flex-1 flex flex-col min-h-dvh lg:ml-[260px]">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 glass-standard border-b border-warm-200/40 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-5 rounded lg:hidden" />
            <span className="flex-1" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-xl" />
              <Skeleton className="h-8 w-16 rounded-xl" />
              <Skeleton className="h-8 w-8 rounded-xl" />
            </div>
          </div>
        </header>

        {/* Content — same stat-grid + card-grid shape as page.tsx's own
            in-page loading branch */}
        <div className="flex-1 p-3 sm:p-4 md:p-6 min-w-0 overflow-x-hidden">
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatSkeleton key={i} />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
