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
      route="/golf/dashboard/roster"
      component="RosterPage"
      title="Failed to load roster"
      message="We couldn't load your team roster. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
