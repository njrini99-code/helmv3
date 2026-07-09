// Route-level skeleton for the Player Lift session (execution) view.
// Mirrors PlayerLiftSessionClient's real first viewport (title + set-progress
// bar, readiness gate card, exercise cards) on the same Living Annual tokens
// (--paper/--hairline/rounded-card) as the page itself.

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerLiftSessionLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28">
      {/* Session title + set-progress bar */}
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1.5 h-4 w-32" />
        <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
      </div>

      {/* Readiness gate card */}
      <div className="mt-5 flex items-center justify-between gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4">
        <Skeleton className="h-4 w-52 max-w-full" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-fw-sm" />
      </div>

      {/* Exercise cards */}
      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-3 w-40" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-9 w-full rounded-fw-sm" />
              <Skeleton className="h-9 w-full rounded-fw-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
