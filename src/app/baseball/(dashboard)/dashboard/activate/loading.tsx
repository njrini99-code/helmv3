import { Skeleton } from '@/components/ui/skeleton';

/**
 * Activate Recruiting loading skeleton — mirrors the hero + feature-grid + CTA layout.
 */
export default function ActivateLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      {/* Header */}
      <div className="border-b border-warm-100 bg-cream-50/80 px-4 py-5 sm:px-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-1.5 h-4 w-56" />
      </div>

      <div className="mx-auto max-w-[720px] p-6 lg:p-8">
        {/* Hero card */}
        <div className="mb-6 glass-standard rounded-2xl p-8">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="mx-auto mt-4 h-8 w-64" />
          <Skeleton className="mx-auto mt-3 h-4 w-full max-w-md" />
          <Skeleton className="mx-auto mt-2 h-4 w-3/4 max-w-md" />
          <Skeleton className="mx-auto mt-6 h-8 w-48 rounded-full" />
        </div>

        {/* Feature grid */}
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-standard rounded-2xl p-5 space-y-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-full" />
              <div className="space-y-1.5">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-4 w-4/5" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Privacy section */}
        <div className="mb-6 glass-standard rounded-2xl p-5 space-y-2">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-4/5" />
              ))}
            </div>
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-4/5" />
              ))}
            </div>
          </div>
        </div>

        {/* CTA card */}
        <div className="glass-standard rounded-2xl p-8 text-center">
          <Skeleton className="mx-auto h-12 w-48 rounded-xl" />
          <Skeleton className="mx-auto mt-4 h-4 w-72" />
        </div>
      </div>
    </div>
  );
}
