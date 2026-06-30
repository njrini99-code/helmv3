'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function NewGameError({
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
      route="/baseball/dashboard/stats/games/create"
      component="NewGamePage"
      title="New game form unavailable"
      message="We couldn't load the new game form. Please try again."
      homePath="/baseball/dashboard/stats/games"
    />
  );
}
