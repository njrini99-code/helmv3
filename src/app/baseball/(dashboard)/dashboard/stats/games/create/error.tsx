'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { BASEBALL_STATS_GAME_CREATE_PATH } from '@/lib/baseball/stats-route-aliases';

export default function CreateGameError({
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
      route={BASEBALL_STATS_GAME_CREATE_PATH}
      component="CreateGamePage"
      title="New game form unavailable"
      message="We couldn't load the new game form. Please try again."
      homePath="/baseball/dashboard/stats/games"
    />
  );
}
