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
      route="/baseball/dashboard/teams"
      component="TeamsPage"
      title="Failed to load teams"
      message="We couldn't load teams. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
