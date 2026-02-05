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
      route="/golf/dashboard/coachhelm"
      component="CoachHelmPage"
      title="Failed to load CoachHelm"
      message="We couldn't load the CoachHelm dashboard. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
