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
      route="/baseball/dashboard/players/[id]/profile"
      component="PlayerProfilePage"
      title="Failed to load player profile"
      message="We couldn't load this player's profile. The player may not exist or there might be a connection issue."
      homePath="/baseball/dashboard/discover"
    />
  );
}
