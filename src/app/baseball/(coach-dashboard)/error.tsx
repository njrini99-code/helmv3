'use client';

/**
 * Group-level error boundary for the coach dashboard route group.
 *
 * Catches render-time throws in ANY coach segment (college / high-school /
 * juco / showcase) — including the thin delegate pages (juco -> JucoTeamDashboard,
 * showcase -> OrgDashboard) whose data fetching lives in child components and
 * cannot be guarded by an inline `error` field on the page itself.
 *
 * The route group previously had no error.tsx at its root, so a render-time
 * throw bubbled unhandled past the group to the app root. This is the safety
 * net; the inline DashboardErrorState surfaces (consumed in the pages from the
 * data hooks' `error` field) are the first, recoverable line of defense.
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
