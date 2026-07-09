'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({
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
      route="/baseball/dashboard/players/[id]/stats"
      component="PlayerStatsPage"
      title="Failed to load player stats"
      message="We couldn't load the statistics for this player. This might be a temporary issue. Please try again."
      homePath="/baseball/dashboard/roster"
    />
  );
}
