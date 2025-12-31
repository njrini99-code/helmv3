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
      route="/golf/dashboard/team"
      component="TeamPage"
      title="Failed to load team"
      message="We couldn't load your team information. Please try again."
      homePath="/golf/dashboard"
    />
  );
}
