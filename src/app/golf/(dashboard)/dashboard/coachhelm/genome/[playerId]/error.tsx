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
      component="LegacyCoachGenomePage"
      homePath="/golf/dashboard/coachhelm"
    />
  );
}
