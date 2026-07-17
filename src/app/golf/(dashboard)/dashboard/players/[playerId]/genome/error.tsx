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
      route="/golf/dashboard/players/[playerId]/genome"
      component="PlayerGenomePage"
      title="Failed to load genome"
      message="We couldn't load this player's genome. Please try again."
      homePath="/golf/dashboard/coachhelm"
    />
  );
}
