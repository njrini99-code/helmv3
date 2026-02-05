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
      route="/golf/dashboard/roster/[id]"
      component="PlayerDetailPage"
      title="Failed to load player details"
      message="We couldn't load this player's details. Please try again."
      homePath="/golf/dashboard/roster"
    />
  );
}
