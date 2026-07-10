// Route-level skeleton for Player Practice. The page awaits getPlayerPractices()
// before rendering, so this prevents the previous route from freezing during
// the data fetch. Mirrors PlayerPracticeClient's post-migration first viewport
// (SectionMasthead + PaperCard-shaped blocks) on the SAME Living Annual tokens
// as the page itself (fairwayScope + --paper/--hairline), not the legacy
// cream/warm/glass tokens.

import { Skeleton } from '@/components/ui/skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

export default function PlayerPracticeLoading() {
  return (
    <div className={fairwayScope('min-h-dvh')}>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Masthead */}
        <div>
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-2 h-9 w-48" />
          <Skeleton className="mt-3 h-[3px] w-16 rounded-full" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </div>

        {/* Practice cards */}
        <div className="mt-8 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-fw-sm" />
              </div>
              <div className="space-y-2">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-10 w-full rounded-fw-sm" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
