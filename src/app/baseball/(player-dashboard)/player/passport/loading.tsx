// Route-level skeleton for Player Passport (self view).
// The page awaits getPlayerPassport (full mode) + getPassportSettingsForEditor in
// parallel before rendering. This skeleton mirrors the dedicated passport layout:
// back-link + PlayerPassportFairway cover + VisibilityControls, on the SAME
// Living Annual tokens as the page it precedes (fairwayScope + --paper/
// --hairline), not the legacy cream/warm tokens — the page migrated to the kit
// but this skeleton still had the old drift.

import { Skeleton } from '@/components/ui/skeleton';
import { fairwayScope } from '@/lib/redesign/flag';
import { cn } from '@/lib/utils';

export default function PlayerPassportLoading() {
  return (
    <div className={cn(fairwayScope('min-h-dvh'))}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Back link */}
        <Skeleton className="mb-6 h-4 w-28" />

        {/* Passport cover card */}
        <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8 lg:p-10">
          {/* Masthead + exposure badge */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-56" />
            </div>
            <Skeleton className="h-6 w-36 rounded-fw-sm" />
          </div>

          <Skeleton className="mt-6 h-[1.5px] w-16 rounded-full" />

          {/* Identity grid */}
          <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>

          <Skeleton className="my-8 h-px w-full" />

          {/* Verified Measurables — ruled stat lines */}
          <Skeleton className="mb-4 h-3 w-40" />
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-[1.5px] w-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Performance / Development Story / Media blocks */}
        <div className="mt-8 space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8">
              <Skeleton className="mb-4 h-3 w-40" />
              <Skeleton className="h-24 w-full rounded-card" />
            </div>
          ))}
        </div>

        {/* Visibility Controls card */}
        <div className="mt-8 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-fw-sm" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-52" />
            </div>
          </div>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
          <div className="mt-6">
            <Skeleton className="mb-2 h-4 w-20" />
            <Skeleton className="h-11 w-full rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
