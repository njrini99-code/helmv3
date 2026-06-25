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
      route="/baseball/dashboard/practice-effectiveness"
      component="BaseballPracticeEffectivenessPage"
      title="Failed to load Practice Effectiveness"
      message="We couldn't load your practice-effectiveness measurements. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
