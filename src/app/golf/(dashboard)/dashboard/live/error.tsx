'use client';

import { RouteErrorBoundary } from '@/components/errors';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      route="/golf/dashboard/live"
      component="LivePage"
      title="Failed to load live rounds"
      message="We couldn't load the live rounds. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
