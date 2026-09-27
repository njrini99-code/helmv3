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
      route="/golf/dashboard/dev/haptics"
      component="GolfHapticsLabPage"
      title="Couldn't load the haptics lab"
      message="We couldn't load this page. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
