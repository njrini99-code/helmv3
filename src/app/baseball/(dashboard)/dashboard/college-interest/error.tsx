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
      route="/baseball/dashboard/college-interest"
      component="CollegeInterestPage"
      title="Failed to load college interest"
      message="We couldn't load college interest. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
