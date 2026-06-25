// Route-level skeleton for the Import Center. The page awaits a server
// capability gate plus getImportRuns() + listImportSources() before rendering,
// so without this a navigation froze the previous route until those resolved.
// Mirrors ImportCenterShell's first viewport (header + tab pills + body).

import { Skeleton } from '@/components/ui/skeleton';

export default function ImportCenterLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="mt-2 h-4 w-80" />
      </header>

      {/* Tab pills */}
      <div className="mb-6 inline-flex gap-1 rounded-xl border border-warm-200 bg-cream-50 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>

      {/* Body: upload card + recent runs */}
      <div className="space-y-6">
        <Skeleton className="h-44 rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
