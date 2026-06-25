'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function GamesError({
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
      route="/baseball/dashboard/stats/games"
      component="GamesPage"
      title="Games unavailable"
      message="We couldn't load the games list. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
