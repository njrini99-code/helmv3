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
      route="/baseball/coach"
      component="BaseballCoachOnboardingAlt"
      title="Onboarding error"
      message="We couldn't load coach onboarding. Please try again."
      homePath="/baseball/dashboard"
    />
  );
}
