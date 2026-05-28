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
      route="/baseball/dashboard/stats/upload"
      component="StatsUploadPage"
      title="Failed to load stats upload"
      message="We couldn't load stats upload. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
