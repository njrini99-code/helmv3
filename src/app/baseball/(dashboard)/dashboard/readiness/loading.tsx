// Route-level skeleton for the Player Readiness check-in. Mirrors
// PlayerReadinessClient's real first viewport (eyebrow/title heading, the
// "How you feel" scale-row card, bodyweight + notes cards, submit button)
// on the same Living Annual tokens (--paper/--hairline/rounded-card) as the
// page itself.

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerReadinessLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Page heading */}
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>

      {/* How you feel */}
      <div className="mt-5 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
        <Skeleton className="h-5 w-32" />
        <div className="mt-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-9 flex-1 rounded-fw-sm" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bodyweight */}
      <div className="mt-4 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-10 w-32 rounded-fw-sm" />
      </div>

      {/* Notes */}
      <div className="mt-4 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="mt-3 h-20 w-full rounded-fw-sm" />
      </div>

      <Skeleton className="mt-4 h-11 w-full rounded-fw-sm" />
    </div>
  );
}
