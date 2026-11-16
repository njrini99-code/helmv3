'use client';

import { RouteErrorBoundary } from '@/components/errors';

// A thrown error here used to fall through to the root error page, styled for another product (GAP-R-18).
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
      route="/lifting/coach"
      component="LiftLabCoachOnboarding"
      title="Setup error"
      message="We couldn't load Lift Lab setup. Please try again."
      homePath="/lifting/login"
    />
  );
}
