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
      route="/golf/dashboard/my-standing"
      component="MyStandingPage"
      title="Failed to load standings"
      message="We couldn't load your standings. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
