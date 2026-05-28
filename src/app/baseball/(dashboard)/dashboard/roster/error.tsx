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
      route="/baseball/dashboard/roster"
      component="BaseballRosterPage"
      title="Failed to load roster"
      message="We couldn't load the roster. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
