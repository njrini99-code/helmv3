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
      route="/golf/dashboard/classes"
      component="ClassesPage"
      title="Failed to load classes"
      message="We couldn't load your classes. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
