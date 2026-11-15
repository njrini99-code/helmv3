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
      route="/lifting/join"
      component="LiftLabJoinPage"
      title="Invite error"
      message="We couldn't open this Lift Lab invite. Please try again."
      homePath="/lifting/login"
    />
  );
}
