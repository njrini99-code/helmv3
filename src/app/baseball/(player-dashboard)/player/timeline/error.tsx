'use client';

/**
 * Route-level error boundary for /baseball/player/timeline.
 *
 * The group-level boundary at (player-dashboard)/error.tsx was catching throws
 * from this surface but reporting route='/baseball/player' in Sentry. This
 * segment-level boundary takes priority, reports the correct route, and gives
 * the player a useful "Try Again" path that re-runs the server reads.
 */

import { RouteErrorBoundary } from '@/components/errors';

export default function PlayerTimelineError({
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
      route="/baseball/player/timeline"
      component="PlayerTimelineSegment"
      title="Could not load your timeline"
      message="We couldn't load your development story. This is usually a temporary issue — please try again."
      homePath="/baseball/player/today"
    />
  );
}
