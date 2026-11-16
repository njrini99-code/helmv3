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
      route="/lifting/login"
      component="LiftLabAuthPage"
      title="Something went wrong"
      message="We couldn't load this Lift Lab page. Please try again."
      homePath="/lifting/login"
    />
  );
}
