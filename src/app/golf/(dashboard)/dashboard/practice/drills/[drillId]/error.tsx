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
      route="/golf/dashboard/practice"
      component="PracticeHomePage"
      title="Failed to load Practice"
      message="We couldn’t load your plans. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
