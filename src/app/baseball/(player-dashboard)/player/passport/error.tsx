'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function PassportError({
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
      route="/baseball/player/passport"
      component="PlayerPassportPage"
      title="Passport couldn't load"
      message="We couldn't load your Player Passport. Please try again."
      homePath="/baseball/player/today"
    />
  );
}
