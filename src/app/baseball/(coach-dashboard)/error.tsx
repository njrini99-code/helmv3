'use client';

/**
 * Group-level error boundary for the coach dashboard route group.
 *
 * Catches render-time throws in ANY coach segment (college / high-school /
 * juco / showcase). These type-specific routes now redirect into the main
 * dashboard shell, but the group still needs a local boundary.
 *
 * The route group previously had no error.tsx at its root, so a render-time
 * throw bubbled unhandled past the group to the app root. This is the safety
 * net for stale bookmarks and transitional route failures.
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
      route="/baseball/coach"
      component="CoachDashboardSegment"
      title="Something went wrong"
      message="We couldn't load your dashboard. Please try again."
      homePath="/baseball/coach"
    />
  );
}
