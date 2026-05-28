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
      route="/baseball/dashboard/camps/[id]"
      component="CampDetailPage"
      title="Failed to load camp"
      message="We couldn't load this camp. Please try again."
      homePath="/baseball/dashboard/camps"
    />
  );
}
