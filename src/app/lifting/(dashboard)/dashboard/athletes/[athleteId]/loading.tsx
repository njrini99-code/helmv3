// =============================================================================
// src/app/lifting/(dashboard)/dashboard/athletes/[athleteId]/loading.tsx
//
// Skeleton for the athlete drill-down page — shown while the five sequential
// Supabase awaits (org resolve, access check, athlete row, sessions, PRs,
// maxes, readiness check-ins) resolve. Mirrors page.tsx exactly: back link,
// large AthleteProfileCard shape, then the session-history / bests /
// readiness three-column grid.
// =============================================================================

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IconArrowLeft } from '@/components/icons';

export default function AthleteDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading athlete profile">
      {/* Back nav — stays real/clickable, costs nothing */}
      <Link
        href="/lifting/dashboard/athletes"
        className="inline-flex items-center gap-1.5 text-sm text-warm-500 transition-colors hover:text-primary-700"
      >
        <IconArrowLeft size={15} />
        All Athletes
      </Link>

      {/* Athlete identity card — mirrors AthleteProfileCard size="large" */}
      <div className="glass-standard rounded-2xl shadow-glass p-6">
        <div className="flex items-start gap-5">
          <Skeleton variant="circular" className="h-14 w-14 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-6 w-44 rounded-lg" />
            <Skeleton className="h-4 w-28 rounded-full" />
          </div>
        </div>
      </div>

      {/* Three-column detail grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Session history */}
        <div className="space-y-4 lg:col-span-2">
          <Card variant="glass">
            <CardHeader>
              <Skeleton className="h-5 w-36 rounded-lg" />
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-warm-100">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-6 py-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32 rounded-lg" />
                      <Skeleton className="h-3 w-24 rounded-full" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: bests + readiness */}
        <div className="space-y-4">
          <Card variant="glass">
            <CardHeader>
              <Skeleton className="h-4 w-16 rounded-lg" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-lg" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <Skeleton className="h-4 w-32 rounded-lg" />
            </CardHeader>
            <CardContent className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-10 shrink-0 rounded-full" />
                  <Skeleton className="h-1.5 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-6 shrink-0 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
