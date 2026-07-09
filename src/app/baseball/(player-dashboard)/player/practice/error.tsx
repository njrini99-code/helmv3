'use client';

/**
 * Route-level error boundary for /baseball/player/practice.
 *
 * Without this segment-level boundary, a throw here falls through to the
 * (player-dashboard)/error.tsx group boundary, which reports the wrong route
 * to Sentry and sends "Try Again"/"Go Home" back to the wrong surface — the
 * same gap fixed for /player/today (see that segment's error.tsx).
 */

import { RouteErrorBoundary } from '@/components/errors';

export default function PlayerPracticeError({
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
      route="/baseball/player/practice"
      component="PlayerPracticeSegment"
      title="Could not load Practice"
      message="We couldn't load your practice plan. This is usually a temporary issue — please try again."
      homePath="/baseball/player/today"
    />
  );
}
