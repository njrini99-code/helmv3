// Route-level skeleton for the Player Lift home. Mirrors
// PlayerLiftHomeClient's real first viewport (eyebrow/title heading,
// readiness reminder card, Today/Upcoming/Recent cards) on the same Living
// Annual tokens (--paper/--hairline/rounded-card) as the page itself, so
// there is no layout shift when data lands.

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerLiftLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Page heading */}
      <div>
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-2 h-8 w-20" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>

      {/* Readiness reminder card */}
      <div className="mt-6 flex items-center gap-3 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-4">
        <Skeleton variant="circular" className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0 rounded-fw-sm" />
      </div>

      {/* Today / Upcoming / Recent */}
      <div className="mt-4 space-y-4">
        {['Today', 'Upcoming', 'Recent'].map((label) => (
          <div key={label} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
            <Skeleton className="h-5 w-24" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full rounded-fw-sm" />
              <Skeleton className="h-10 w-full rounded-fw-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
