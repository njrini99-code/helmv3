// =============================================================================
// src/app/lifting/(dashboard)/dashboard/lift/loading.tsx
//
// Skeleton UI shown while the Lift home page is streaming / resolving.
// Mirrors the card structure of PlayerLiftHomeClient:
//   • page heading
//   • today's session card
//   • upcoming list
//   • recent list
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function LiftPageLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your lift sessions">
      {/* Page heading skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-36 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-xl" />
        <Skeleton className="h-3.5 w-52 rounded-full" />
      </div>

      {/* Today's session card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-14 rounded-lg" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="h-3.5 w-28 rounded-full" />
            </div>
            <Skeleton className="h-10 w-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Upcoming sessions */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24 rounded-lg" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-warm-100 px-3 py-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28 rounded-lg" />
                  <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-10 rounded-full" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Recent history */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-16 rounded-lg" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-warm-50 px-3 py-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-lg" />
                  <Skeleton className="h-3 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-12 rounded-full" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
