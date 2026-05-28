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
      route="/baseball/dashboard/academics"
      component="AcademicsPage"
      title="Failed to load academics"
      message="We couldn't load academics. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
