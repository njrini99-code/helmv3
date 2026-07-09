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
      route="/baseball/dashboard/players/[id]/scout-packet"
      component="CoachScoutPacketPage"
      title="Scout packet couldn't load"
      message="We couldn't load this player's scout packet links. Please try again."
      homePath="/baseball/dashboard/scout-packets"
    />
  );
}
