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
      route="/golf/dashboard/settings/coaching-intelligence"
      component="CoachingIntelligenceSettings"
      title="Failed to load settings"
      message="We couldn't load coaching intelligence settings. Please try again."
      homePath="/golf/dashboard/settings"
    />
  );
}
