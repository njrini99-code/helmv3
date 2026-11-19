'use client';

import { RouteErrorBoundary } from '@/components/errors';
import { GateError } from '@/clubhouse/screens/auth/GateError';

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
      outsideShell={GateError}
      route="/golf/player-onboarding"
      component="GolfPlayerOnboarding"
      title="Onboarding error"
      message="We couldn't load player onboarding. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
