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
      route="/golf/dashboard/players/[playerId]/game"
      component="PlayerGamePage"
      title="Failed to load player game profile"
      message="We couldn't load this player's game profile. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
