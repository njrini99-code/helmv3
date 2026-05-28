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
      route="/golf/player-onboarding"
      component="GolfPlayerOnboarding"
      title="Onboarding error"
      message="We couldn't load player onboarding. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
