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
      route="/baseball/dashboard/camps"
      component="CampsPage"
      title="Failed to load camps"
      message="We couldn't load camps. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
