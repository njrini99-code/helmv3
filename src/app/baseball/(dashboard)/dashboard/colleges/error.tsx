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
      route="/baseball/dashboard/colleges"
      component="CollegesPage"
      title="Failed to load colleges"
      message="We couldn't load colleges. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
