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
      route="/baseball/dashboard/discover"
      component="DiscoverPage"
      title="Failed to load players"
      message="We couldn't load the player list. This might be a temporary connection issue or a problem with the filters you've applied."
      homePath="/baseball/dashboard"
    />
  );
}
