'use client';

/**
 * Group-level error boundary for the player dashboard route group.
 *
 * Catches render-time throws in ANY player segment under (player-dashboard) —
 * the heavy Player Today surface (P4.2), My Timeline, the Passport view, and
 * the four player-type homes (juco / high-school / showcase / college) — plus
 * any view-model serialization failure that escapes the server read-models.
 *
 * The group previously had NO error.tsx at any level, so a render-time throw
 * bubbled unhandled past the group to the app root (src/app/error.tsx), which
 * only console.error()s and never reports to Sentry. The sibling coach group
 * already has this boundary; this restores parity. RouteErrorBoundary's
 * logError path is what wires these client errors into Sentry + error_logs.
 */

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
      route="/baseball/player"
      component="PlayerDashboardSegment"
      title="Something went wrong"
      message="We couldn't load this page. Please try again."
      homePath="/baseball/player/today"
    />
  );
}
