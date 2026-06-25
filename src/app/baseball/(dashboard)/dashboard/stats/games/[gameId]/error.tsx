'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function GameDetailError({
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
      route="/baseball/dashboard/stats/games/[gameId]"
      component="GameDetailPage"
      title="Game detail unavailable"
      message="We couldn't load this game's box score. Please try again."
      homePath="/baseball/dashboard/stats/games"
    />
  );
}
