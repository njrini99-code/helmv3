// =============================================================================
// src/app/lifting/(dashboard)/dashboard/lift/[sessionId]/loading.tsx
//
// Skeleton UI shown while the session execution page is streaming / resolving.
// Mirrors the structure of PlayerLiftSessionClient:
//   • back link
//   • session title + progress bar
//   • start CTA area
//   • 2 exercise section cards
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function LiftSessionLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading session">
      {/* Back link */}
      <Skeleton className="h-4 w-24 rounded-full" />

      {/* Session header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 rounded-xl" />
        <Skeleton className="h-3.5 w-36 rounded-full" />
        {/* Progress bar */}
        <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
      </div>

      {/* Start CTA placeholder */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* Exercise section card 1 */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32 rounded-lg" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-warm-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-36 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-28 rounded-full" />
              <div className="space-y-2 mt-2">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-10 rounded-full" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-14 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Exercise section card 2 */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28 rounded-lg" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-xl border border-warm-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="space-y-2 mt-2">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-10 rounded-full" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                    <Skeleton className="h-9 w-14 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
