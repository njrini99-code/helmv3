'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function SeasonStatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/baseball/dashboard/stats/season"
      component="SeasonStatsPage"
      title="Season stats unavailable"
      message="We couldn't load the season stats. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
