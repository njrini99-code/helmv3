import { Surface, Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for the coach What's New feed.
 *
 * Shape-matches <FairwayWhatsNew/> inside fairwayScope('min-h-full
 * bg-canvas'): max-w-[720px], a ViewHeader-shaped block, and matte
 * Surface(elevation="border") day-groups divided by border-subtle — so the
 * skeleton→content handoff is a quiet fade, not a chrome swap.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading activity…</span>

        {/* ViewHeader placeholder: eyebrow · title · description · meta */}
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-3/4 max-w-[420px]" />
          <Skeleton className="h-4 w-full max-w-[560px]" />
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Day groups — matte Surface rows on border-subtle dividers */}
        <div className="mt-8 flex flex-col gap-6">
          {[
            { label: 'h-3 w-16', rows: 3 },
            { label: 'h-3 w-20', rows: 1 },
          ].map((group, gi) => (
            <section key={gi} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2 px-1">
                <Skeleton className={group.label} />
                <Skeleton className="h-3 w-6" />
              </div>
              <Surface elevation="border" padding="none">
                <ul className="divide-y divide-border-subtle">
                  {Array.from({ length: group.rows }).map((_, ri) => (
                    <li key={ri} className="flex items-start gap-3 px-4 py-3">
                      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </li>
                  ))}
                </ul>
              </Surface>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
