import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/admin/crm.
 *
 * Shape-matches the CRM shell's real Fairway first paint (see ./page.tsx): the
 * 260px warm-black rail on the left, the sticky glass top bar with its title +
 * StatusPill meta cluster on the right, and the card stack the default "Today"
 * destination lands on. The previous fallback was the pre-Fairway
 * `GenericPageSkeleton`, which drew a centered one-column page and then jumped
 * into this two-column shell on hydration.
 *
 * The rail is hidden below `lg` exactly like the real `<aside>`; on a phone the
 * shell shows a 56px nav-bg header instead, which this mirrors so the content
 * offset (`pt-14 lg:pt-0`) is identical before and after hydration.
 */
export default function Loading() {
  return (
    <div
      className={fairwayScope('flex min-h-dvh bg-canvas')}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading CRM…</span>

      {/* Mobile header — matches the real fixed nav-bg bar (h-14). */}
      <header
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-50 h-14 border-b border-nav-text/10 bg-nav-bg lg:hidden"
      >
        <div className="flex h-14 items-center gap-3 px-3">
          <Skeleton className="h-10 w-10 rounded-fw-md bg-nav-surface" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28 bg-nav-surface" />
            <Skeleton className="h-2.5 w-40 bg-nav-surface" />
          </div>
          <Skeleton className="h-10 w-20 rounded-fw-md bg-nav-surface" />
        </div>
      </header>

      {/* Desktop rail — matches the 260px warm-black <aside>. */}
      <aside
        aria-hidden="true"
        className="fixed inset-y-0 left-0 z-50 hidden w-[260px] flex-col border-r border-nav-text/10 bg-nav-bg lg:flex"
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <Skeleton className="h-9 w-9 rounded-fw-sm bg-nav-surface" />
          <Skeleton className="h-4 w-28 bg-nav-surface" />
        </div>
        <div className="px-3 pb-2">
          <Skeleton className="h-9 w-full rounded-fw-sm bg-nav-surface" />
        </div>
        <div className="mx-3 border-t border-nav-text/10" />
        {/* 8 destinations across the 3 labelled sections (Work/Automate/Admin). */}
        <nav className="flex-1 px-3 py-3">
          {[5, 2, 1].map((rows, section) => (
            <div key={rows} className={section > 0 ? 'pt-4' : undefined}>
              <Skeleton className="mb-2 ml-3 h-2.5 w-16 bg-nav-surface" />
              {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="mb-1 h-10 w-full rounded-fw-sm bg-nav-surface" />
              ))}
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-nav-text/10 p-3">
          <Skeleton className="h-10 w-full rounded-fw-sm bg-nav-surface" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-fw-sm bg-nav-surface" />
            <Skeleton className="h-9 flex-1 rounded-fw-sm bg-nav-surface" />
          </div>
        </div>
      </aside>

      {/* Main column — mirrors <main>'s pt-14 lg:pt-0 + lg:ml-[260px]. */}
      <main className="flex min-h-dvh min-w-0 flex-1 flex-col pt-14 lg:ml-[260px] lg:pt-0">
        {/* Sticky glass top bar. */}
        <div
          aria-hidden="true"
          className="hidden border-b border-border-subtle bg-surface/85 px-6 py-3 lg:block"
        >
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-64" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
          </div>
        </div>

        {/* Content area — the Today destination's toolbar + queue cards. */}
        <div className="flex-1 space-y-4 p-3 sm:p-5 lg:p-6">
          <Skeleton className="h-14 w-full rounded-card" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-card" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-card" />
          </div>
        </div>
      </main>
    </div>
  );
}
