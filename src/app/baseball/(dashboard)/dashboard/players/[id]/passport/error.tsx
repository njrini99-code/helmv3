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
      route="/baseball/dashboard/players/[id]/passport"
      component="CoachPlayerPassportPage"
      title="Passport couldn't load"
      message="We couldn't load this player's passport. Please try again."
      homePath="/baseball/dashboard/roster"
    />
  );
}
