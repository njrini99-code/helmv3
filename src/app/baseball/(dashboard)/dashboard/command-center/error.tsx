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
      route="/baseball/dashboard/command-center"
      component="CommandCenterPage"
      title="Failed to load command center"
      message="We couldn't load the command center. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
