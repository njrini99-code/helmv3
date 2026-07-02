// Route-level skeleton for the Import Center. The page awaits a server
// capability gate plus getImportRuns() + listImportSources() before rendering,
// so without this a navigation froze the previous route until those resolved.
// Mirrors ImportCenterShell's first viewport (masthead + mode tabs + body) —
// Living Annual paper stock, never a bare spinner.

import { Skeleton } from '@/components/ui/skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

export default function ImportCenterLoading() {
  return (
    <div className={fairwayScope('min-h-full')}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {/* Masthead */}
        <header className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-[3px] w-16 rounded-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </header>

        {/* Mode tabs */}
        <div className="flex gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-40 rounded-fw-lg" />
          ))}
        </div>

        {/* Body: upload card + recent imports */}
        <div className="space-y-6">
          <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-6 sm:p-8">
            <Skeleton className="h-40 rounded-card" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
