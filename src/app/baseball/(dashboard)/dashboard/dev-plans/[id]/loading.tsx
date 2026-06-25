import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <>
      <Header title="Development Plan" subtitle="Detailed plan view" backHref="/baseball/dashboard/dev-plans" />
      <div className="p-6 lg:p-8 space-y-6">
        {/* Plan header skeleton */}
        <Card variant="glass">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-warm-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-32" />
            </div>
          </CardContent>
        </Card>

        {/* Goals skeleton */}
        <Card variant="glass">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-24 mt-1" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-xl border border-warm-200 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Skeleton className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
