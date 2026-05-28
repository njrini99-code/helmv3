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
      route="/baseball/dashboard/organization"
      component="OrganizationPage"
      title="Failed to load organization"
      message="We couldn't load your organization. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
