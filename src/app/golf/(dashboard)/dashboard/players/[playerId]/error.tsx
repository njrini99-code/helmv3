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
      route="/golf/dashboard/players"
      component="PlayerInsightPage"
      title="Failed to load player insight"
      message="We couldn't load this player's data. Please try again."
      homePath="/golf/dashboard/roster"
    />
  );
}
