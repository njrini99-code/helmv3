// Route-level skeleton for Player Today. The page awaits a Promise.all of
// getPlayerToday + getPlayerDailyContract + getPlayerPassport plus team-tz
// resolution before rendering, so without this a navigation froze the previous
// route until all four resolved. Mirrors PlayerTodayClient's post-migration
// first viewport (masthead + CTA row + contents-strip/readiness + 2-col
// primary/sidebar grid) on the SAME Living Annual tokens as the page itself.

import { Skeleton } from '@/components/ui/skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

export default function PlayerTodayLoading() {
  return (
    <div className={fairwayScope('min-h-dvh')}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Masthead */}
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2 h-10 w-80 max-w-full" />
          <Skeleton className="mt-3 h-[3px] w-16 rounded-full" />
          <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        </div>

        {/* Primary CTA row */}
        <div className="mt-5 flex flex-wrap gap-3">
          <Skeleton className="h-9 w-28 rounded-card" />
          <Skeleton className="h-9 w-36 rounded-card" />
        </div>

        {/* Next-event hero */}
        <div className="mt-6 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          </div>
        </div>

        {/* Contents strip + readiness */}
        <div className="mt-9 space-y-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-[1.5px] w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-28 w-full rounded-card" />
        </div>

        {/* Body grid: primary column + sidebar */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="space-y-10 lg:col-span-2">
            <Skeleton className="h-48 rounded-card" />
            <Skeleton className="h-40 rounded-card" />
            <Skeleton className="h-40 rounded-card" />
          </div>
          <div className="space-y-10">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-40 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
