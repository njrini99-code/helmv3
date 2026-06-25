'use client';

/**
 * Route-level error boundary for /baseball/player/today (Player Today surface).
 *
 * The group-level boundary at (player-dashboard)/error.tsx was catching throws
 * from this surface but reporting route='/baseball/player' in Sentry — the wrong
 * label. A serialization failure in getPlayerToday() or a bad dailyContract
 * payload would surface as "player dashboard error" with the wrong "Back to
 * dashboard" path, making triage harder.
 *
 * This segment-level boundary takes priority over the group boundary for any
 * render-time throw that originates in the /player/today segment, reports the
 * correct route to Sentry, and gives the user a useful "Try Again" or "Back to
 * Today" recovery path.
 */

import { RouteErrorBoundary } from '@/components/errors';

export default function PlayerTodayError({
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
      route="/baseball/player/today"
      component="PlayerTodaySegment"
      title="Could not load Today"
      message="We couldn't load your daily rundown. This is usually a temporary issue — please try again."
      homePath="/baseball/player/today"
    />
  );
}
