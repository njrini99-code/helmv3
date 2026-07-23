import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/** One SectionCard's skeleton: icon chip + title + description + rows —
 *  mirrors FairwaySettingsGeneral's own SectionCard anatomy and its internal
 *  `!profile` loading branch (3 stacked Surface cards). */
function SectionCardSkeleton({ titleWidth, rows = 2 }: { titleWidth: string; rows?: number }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-8">
      <div className="mb-5 flex items-start gap-3">
        <Skeleton className="h-9 w-9 flex-shrink-0 rounded-fw-sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className={`h-5 ${titleWidth}`} />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-fw-md" />
        ))}
      </div>
    </div>
  );
}

/**
 * Route Suspense fallback for /golf/dashboard/settings.
 *
 * Shape-matches FairwaySettingsGeneral: a `max-w-[1200px]` ViewHeader
 * masthead, the identity card (avatar + name/email), and a stack of
 * SectionCard panels (Personal info, Email, Password, Appearance,
 * Notifications) in the same order the live page renders them.
 */
export default function SettingsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading settings…</span>

        {/* ViewHeader */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {/* Identity card */}
          <div className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface p-6">
            <Skeleton circle className="h-12 w-12 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3.5 w-56" />
            </div>
          </div>

          <SectionCardSkeleton titleWidth="w-40" />
          <SectionCardSkeleton titleWidth="w-32" rows={1} />
          <SectionCardSkeleton titleWidth="w-44" />
          <SectionCardSkeleton titleWidth="w-28" rows={3} />
        </div>
      </div>
    </div>
  );
}
